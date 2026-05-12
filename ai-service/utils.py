"""Text preprocessing utilities for NLP pipeline."""

import re
import string


def preprocess_text(text: str) -> str:
    """Clean and normalize text for classification and similarity."""
    text = text.lower().strip()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def validate_category(category: str) -> str:
    """Ensure category is one of the valid options."""
    valid_categories = ['Academic', 'Technical', 'Hostel', 'Infrastructure', 'Administrative']
    for valid in valid_categories:
        if valid.lower() in category.lower():
            return valid
    return 'Uncategorized'
