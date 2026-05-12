"""Complaint classifier using NVIDIA API (OpenAI-compatible endpoint)."""

import os
import json
from typing import Any, Dict

import httpx  # type: ignore
from dotenv import load_dotenv  # type: ignore
from utils import preprocess_text, validate_category  # type: ignore

load_dotenv()

NVIDIA_API_KEY = os.getenv('NVIDIA_API_KEY')
NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
NVIDIA_MODEL = 'meta/llama-3.1-8b-instruct'

# Local LLM Fallback config
LOCAL_LLM_URL = os.getenv('LOCAL_LLM_URL', 'http://127.0.0.1:1234/v1')

CLASSIFICATION_PROMPT = """You are a complaint classification system for an educational institution.
Classify the following complaint into EXACTLY ONE of these categories:
1. Academic - Related to courses, exams, grades, faculty, teaching, timetable, syllabus
2. Technical - Related to IT issues, internet, lab equipment, software, computers, projectors
3. Hostel - Related to hostel rooms, mess/food, roommates, curfew, hostel maintenance
4. Infrastructure - Related to buildings, washrooms, classrooms, furniture, water, electricity, campus facilities
5. Administrative - Related to fees, certificates, ID cards, library, office staff, admission, registration

Respond with ONLY a JSON object in this format (confidence is 0-1 float):
{{"category": "<category>", "confidence": <float>, "sentiment": "<Neutral, Frustrated, Urgent, Positive>", "reply_message": "<A polite, professional 1-2 sentence automated response acknowledging the specific issue as a formal institutional administrator>"}}

Complaint: {complaint_text}"""


def _parse_llm_response(result_text: str) -> Dict[str, Any]:
    """Parse JSON from LLM response, handling markdown code blocks."""
    text: str = result_text.strip()

    if '```' in text:
        parts = text.split('```')
        text = parts[1] if len(parts) > 1 else text
        if text.startswith('json'):
            text = text[len('json'):]

    result = json.loads(text.strip())

    result['category'] = validate_category(result.get('category', 'Uncategorized'))

    # Normalize confidence — handle both 0-1 and 0-100 scales
    raw_confidence = float(result.get('confidence', result.get('confidence_score', 0)))
    result['confidence'] = min(max(raw_confidence if raw_confidence <= 1 else raw_confidence / 100.0, 0), 1)

    valid_sentiments = ['Neutral', 'Frustrated', 'Urgent', 'Positive']
    sentiment = result.get('sentiment', 'Neutral')
    result['sentiment'] = sentiment if sentiment in valid_sentiments else 'Neutral'

    # Auto-reply extraction
    result['reply_message'] = result.get('reply_message', 'Thank you for your report. It has been logged and assigned to the appropriate department for review.')

    return result


async def classify(text: str) -> Dict[str, Any]:
    """Classify complaint text into a department category."""
    cleaned = preprocess_text(text)
    prompt = CLASSIFICATION_PROMPT.format(complaint_text=text)

    # Primary: NVIDIA API
    try:
        result = await _call_nvidia_api(prompt)
        return result
    except Exception as e:
        print(f"NVIDIA API failure: {e}. Attempting local LLM fallback...")

    # Fallback: Local LM Studio
    try:
        result = await _call_local_llm(prompt)
        result['confidence'] = result['confidence'] * 0.9  # Penalize fallback confidence
        print("Successfully recovered via Local LLM.")
        return result
    except Exception as local_e:
        print(f"Local LLM fallback failed: {local_e}")
        return {'category': 'Uncategorized', 'confidence': 0, 'sentiment': 'Neutral', 'reply_message': 'Thank you for your report. We are experiencing high load but your issue is logged.'}


async def _call_nvidia_api(prompt: str) -> Dict[str, Any]:
    """Call NVIDIA's OpenAI-compatible API for classification."""
    result: Dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            NVIDIA_API_URL,
            headers={
                'Authorization': f'Bearer {NVIDIA_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': NVIDIA_MODEL,
                'messages': [
                    {'role': 'system', 'content': 'You are a JSON-only API. Only output raw JSON.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.1,
                'max_tokens': 150
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        result = _parse_llm_response(content)
    return result


async def _call_local_llm(prompt: str) -> Dict[str, Any]:
    """Fallback method using local LM Studio model."""
    result: Dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{LOCAL_LLM_URL}/chat/completions",
            json={
                'model': 'local-model',
                'messages': [
                    {'role': 'system', 'content': 'You are a JSON-only API. Only output raw JSON.'},
                    {'role': 'user', 'content': prompt}
                ],
                'temperature': 0.1,
                'max_tokens': 150
            }
        )
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        result = _parse_llm_response(content)
    return result
