"""Duplicate complaint detection using TF-IDF and cosine similarity."""

import os
from typing import Any, Dict, List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore
from utils import preprocess_text  # type: ignore

SIMILARITY_THRESHOLD = 0.65

# In-memory store for complaint texts (loaded from DB via API)
complaint_store: Dict[str, str] = {}
vectorizer = TfidfVectorizer(max_features=5000, stop_words='english')
tfidf_matrix = None


def update_store(complaint_id: str, text: str):
    """Add a complaint to the in-memory store."""
    complaint_store[complaint_id] = preprocess_text(text)


def rebuild_matrix():
    """Rebuild TF-IDF matrix from current store."""
    global tfidf_matrix
    if len(complaint_store) < 2:
        tfidf_matrix = None
        return
    texts = list(complaint_store.values())
    tfidf_matrix = vectorizer.fit_transform(texts)


def check_duplicate(text: str, complaint_id: Optional[str] = None) -> Dict[str, Any]:
    """Check if a complaint is a duplicate of an existing one."""
    cleaned = preprocess_text(text)

    if len(complaint_store) < 1:
        return {'is_duplicate': False, 'similar_to': None, 'similarity': 0}

    # Add to store and rebuild
    if complaint_id:
        update_store(complaint_id, text)

    # Need at least 2 complaints to compare
    if len(complaint_store) < 2:
        return {'is_duplicate': False, 'similar_to': None, 'similarity': 0}

    rebuild_matrix()

    if tfidf_matrix is None:
        return {'is_duplicate': False, 'similar_to': None, 'similarity': 0}

    # Transform the new text using the fitted vectorizer
    new_vector = vectorizer.transform([cleaned])
    similarities = cosine_similarity(new_vector, tfidf_matrix).flatten()

    ids = list(complaint_store.keys())

    # Exclude self-comparison
    best_idx = -1
    best_score = 0
    for i, score in enumerate(similarities):
        if ids[i] != complaint_id and score > best_score:
            best_score = score
            best_idx = i

    if best_score >= SIMILARITY_THRESHOLD and best_idx >= 0:
        return {
            'is_duplicate': True,
            'similar_to': ids[best_idx],
            'similarity': float(round(float(best_score), 4))
        }

    return {'is_duplicate': False, 'similar_to': None, 'similarity': float(round(float(best_score), 4))}


def bulk_load(complaints: List[dict]):
    """Load existing complaints from database for comparison."""
    global complaint_store
    for c in complaints:
        complaint_store[c['id']] = preprocess_text(c['text'])
    rebuild_matrix()
