const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const classifyComplaint = async (text) => {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/classify`, {
      text
    }, { timeout: 15000 });
    return response.data;
  } catch (error) {
    console.error('NLP classification error:', error.message);
    return { category: 'Uncategorized', confidence: 0, sentiment: 'Neutral' };
  }
};

const detectDuplicate = async (text, complaintId) => {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/detect-duplicate`, {
      text,
      complaint_id: complaintId
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    console.error('Duplicate detection error:', error.message);
    return { is_duplicate: false, similar_to: null, similarity: 0 };
  }
};

const checkHealth = async () => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return { status: 'unreachable', error: error.message };
  }
};

module.exports = { classifyComplaint, detectDuplicate, checkHealth };
