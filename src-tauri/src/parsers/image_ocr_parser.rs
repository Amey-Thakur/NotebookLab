/*
 * Name: image_ocr_parser.rs
 * Purpose: Parser that turns an image into searchable text with offline OCR.
 * Description: Runs the ocrs engine on the rten runtime, both pure Rust, so no
 *   system libraries are linked and nothing downloads at run time. The
 *   two model files are loaded once and the engine is reused for every
 *   image; it is wrapped in a mutex so it is safe to share across the
 *   import worker threads and so concurrent imports do not oversubscribe
 *   the CPU. Models are never referenced at compile time: when they are
 *   absent (a fresh clone, CI, or before the download step) construction
 *   fails with a plain message and image import is simply unavailable,
 *   which keeps the build and tests green without any model files. A
 *   decode ceiling and downscale bound memory, and the inference call is
 *   wrapped in catch_unwind because ML kernels can panic on odd input.
 * Tech Stack: Rust, ocrs, rten, image
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use std::path::Path;
use std::sync::{Arc, Mutex};

use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;

use crate::error::{AppError, AppResult};

use super::traits::{DocumentParser, ParsedDocument, ParsedPage};

/// Local file names the two ocrs models are saved under (see download-models.cjs).
pub const DETECTION_MODEL_FILE: &str = "text-detection.rten";
pub const RECOGNITION_MODEL_FILE: &str = "text-recognition.rten";

/// Cap the image file, matching the other parsers.
const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// Ceiling on decode allocation so a decompression bomb cannot exhaust memory.
const MAX_DECODE_ALLOC: u64 = 512 * 1024 * 1024;

/// Downscale very large images before OCR to bound CPU and memory. Text stays
/// legible well below this; detail beyond it mostly costs time.
const MAX_OCR_DIMENSION: u32 = 2600;

/// A loaded OCR engine, built once from the two model files and reused. The
/// engine sits behind a mutex: rten inference already uses every core for one
/// image, so serializing images avoids oversubscription, and it lets the handle
/// be shared safely across threads.
pub struct OcrEngineHandle {
    engine: Mutex<OcrEngine>,
}

impl OcrEngineHandle {
    /// Load the engine from a directory holding the two `.rten` model files.
    /// Returns a plain error when either model is missing so the caller can
    /// treat OCR as unavailable rather than crash.
    pub fn from_model_dir(model_dir: &Path) -> AppResult<Self> {
        let detection = model_dir.join(DETECTION_MODEL_FILE);
        let recognition = model_dir.join(RECOGNITION_MODEL_FILE);

        if !detection.exists() || !recognition.exists() {
            return Err(AppError::InvalidInput(format!(
                "OCR models are not installed in {}. Run `npm run models:download` to enable image import.",
                model_dir.display()
            )));
        }

        let detection_model = Model::load_file(&detection).map_err(|e| {
            AppError::Internal(format!("Could not load the OCR detection model: {e}"))
        })?;
        let recognition_model = Model::load_file(&recognition).map_err(|e| {
            AppError::Internal(format!("Could not load the OCR recognition model: {e}"))
        })?;

        let engine = OcrEngine::new(OcrEngineParams {
            detection_model: Some(detection_model),
            recognition_model: Some(recognition_model),
            ..Default::default()
        })
        .map_err(|e| AppError::Internal(format!("Could not start the OCR engine: {e}")))?;

        Ok(Self {
            engine: Mutex::new(engine),
        })
    }

    /// Read all text from one image file.
    pub fn image_to_text(&self, path: &Path) -> AppResult<String> {
        let image = decode_rgb(path)?;
        let (width, height) = (image.width(), image.height());
        let source = ImageSource::from_bytes(image.as_raw(), (width, height))
            .map_err(|e| AppError::Internal(format!("Could not prepare the image for OCR: {e}")))?;

        /* Recover the guard if a previous OCR call panicked; one bad image must
        not disable OCR for the rest of the session. */
        let engine = self
            .engine
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let input = engine
            .prepare_input(source)
            .map_err(|e| AppError::Internal(format!("Could not prepare the image for OCR: {e}")))?;
        engine
            .get_text(&input)
            .map_err(|e| AppError::Internal(format!("OCR could not read this image: {e}")))
    }
}

/// A parser that OCRs an image into a single-page document. Holds a shared
/// engine so every image import reuses the loaded models.
pub struct ImageOcrParser {
    engine: Arc<OcrEngineHandle>,
}

impl ImageOcrParser {
    pub fn new(engine: Arc<OcrEngineHandle>) -> Self {
        Self { engine }
    }
}

impl DocumentParser for ImageOcrParser {
    fn parse(&self, file_path: &Path) -> AppResult<ParsedDocument> {
        let metadata = std::fs::metadata(file_path)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Err(AppError::InvalidInput(format!(
                "File too large: {} bytes (max {})",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        let engine = self.engine.clone();
        let path = file_path.to_path_buf();

        /* rten's kernels can panic on malformed pixels; contain it so a bad
        image surfaces as an import error instead of taking down the worker.
        The release profile keeps panic="unwind" for exactly this. */
        let text = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            engine.image_to_text(&path)
        }))
        .map_err(|_| AppError::Internal("The OCR engine crashed on this image.".into()))??;

        Ok(ocr_text_to_document(file_path, text))
    }
}

/// Decode an image to RGB8, bounding memory and downscaling if it is very large.
fn decode_rgb(path: &Path) -> AppResult<image::RgbImage> {
    let mut reader = image::ImageReader::open(path)
        .map_err(|e| AppError::InvalidInput(format!("Could not open this image: {e}")))?
        .with_guessed_format()
        .map_err(|e| AppError::InvalidInput(format!("Could not read this image: {e}")))?;

    let mut limits = image::Limits::default();
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    reader.limits(limits);

    let decoded = reader
        .decode()
        .map_err(|e| AppError::InvalidInput(format!("Could not decode this image: {e}")))?;

    let decoded = if decoded.width().max(decoded.height()) > MAX_OCR_DIMENSION {
        decoded.resize(
            MAX_OCR_DIMENSION,
            MAX_OCR_DIMENSION,
            image::imageops::FilterType::Triangle,
        )
    } else {
        decoded
    };

    Ok(decoded.into_rgb8())
}

/// Shape recognized text into a single-page document. Pure, so it is tested
/// without any engine or model.
fn ocr_text_to_document(file_path: &Path, text: String) -> ParsedDocument {
    let title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    ParsedDocument {
        title,
        pages: vec![ParsedPage {
            page_number: 1,
            content: text.trim().to_string(),
            headings: Vec::new(),
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_model_dir_errors_when_models_absent() {
        let dir =
            std::env::temp_dir().join(format!("nbl-ocr-missing-{}", uuid::Uuid::new_v4().simple()));
        // The key property for CI: absent models degrade to a plain error, never
        // a crash and never a compile-time requirement.
        assert!(matches!(
            OcrEngineHandle::from_model_dir(&dir),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn ocr_text_to_document_shapes_output() {
        let doc = ocr_text_to_document(Path::new("scan.png"), "  hello world  ".to_string());
        assert_eq!(doc.title, "scan");
        assert_eq!(doc.pages.len(), 1);
        assert_eq!(doc.pages[0].page_number, 1);
        assert_eq!(doc.pages[0].content, "hello world");
        assert!(doc.pages[0].headings.is_empty());
    }

    #[test]
    fn decode_rgb_rejects_non_image() {
        let path = std::env::temp_dir().join(format!(
            "nbl-ocr-nonimage-{}.png",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::write(&path, b"definitely not an image").unwrap();
        let result = decode_rgb(&path);
        std::fs::remove_file(&path).ok();
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    /// Real engine construction + inference, only when the model files are
    /// present locally. CI never sets this feature, so it is skipped there.
    #[cfg(feature = "ocr-models-present")]
    #[test]
    fn engine_loads_and_runs_on_real_models() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/models/ocr");
        let handle = OcrEngineHandle::from_model_dir(&dir).expect("load real OCR models");

        let image = image::RgbImage::from_pixel(96, 48, image::Rgb([255, 255, 255]));
        let path = std::env::temp_dir().join(format!(
            "nbl-ocr-blank-{}.png",
            uuid::Uuid::new_v4().simple()
        ));
        image.save(&path).unwrap();
        let text = handle.image_to_text(&path);
        std::fs::remove_file(&path).ok();

        assert!(text.is_ok(), "engine should run on a valid image");
    }
}
