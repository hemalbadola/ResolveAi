"""FastAPI NLP Microservice — Complaint Classification & Duplicate Detection."""

from typing import Optional, List
from fastapi import FastAPI, File, UploadFile  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from pydantic import BaseModel  # type: ignore
import PyPDF2  # type: ignore
import io
from classifier import classify  # type: ignore
from duplicate_detector import check_duplicate, update_store, bulk_load  # type: ignore
from dotenv import load_dotenv  # type: ignore

load_dotenv()

app = FastAPI(
    title="AI Complaint NLP Service",
    description="Classifies complaints and detects duplicates using NVIDIA API and TF-IDF",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClassifyRequest(BaseModel):
    text: str


class DuplicateRequest(BaseModel):
    text: str
    complaint_id: Optional[str] = None


class BulkLoadRequest(BaseModel):
    complaints: List[dict]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "NLP Microservice"}


@app.post("/classify")
async def classify_complaint(req: ClassifyRequest):
    """Classify a complaint into one of 5 departments."""
    result = await classify(req.text)
    return result


@app.post("/detect-duplicate")
async def detect_duplicate(req: DuplicateRequest):
    """Check if a complaint is a duplicate of existing ones."""
    result = check_duplicate(req.text, req.complaint_id)
    return result


@app.post("/bulk-load")
async def load_complaints(req: BulkLoadRequest):
    """Load existing complaints for duplicate comparison."""
    bulk_load(req.complaints)
    return {"loaded": len(req.complaints)}


@app.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """Extract text from uploaded PDF file (first 2 pages)."""
    text = ""
    try:
        content = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        for page in pdf_reader.pages[:2]:
            text += page.extract_text() + "\n"
        return {"text": text.strip()}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn  # type: ignore
    uvicorn.run(app, host="0.0.0.0", port=8000)
