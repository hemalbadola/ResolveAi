const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', '..', 'uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
})
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
})

const { authenticate } = require('../middleware/auth')

module.exports = ({ model, Complaint }) => {
  const router = express.Router()

  router.post('/', authenticate, upload.single('file'), async (req, res) => {
    try {
      const complaintText = (req.body && req.body.complaint) || ''
      const userId = req.user.id
      
      let attachmentUrl = null
      let fileType = null
      let combinedText = complaintText

      if (req.file) {
        attachmentUrl = '/uploads/' + req.file.filename
        fileType = req.file.mimetype
        
        // Parse the physical file with Gemini / pdf-parse
        try {
          const buffer = fs.readFileSync(req.file.path)
          const parsedContext = await model.parseFileAttachment(buffer, fileType)
          combinedText += parsedContext
        } catch (err) {
          console.error('File parsing error:', err)
        }
      }

      const result = await model.predict(combinedText)

      const doc = new Complaint({
        complaint_text: complaintText, // Only save original text to DB
        predicted_category: result.category,
        confidence: result.confidence,
        assigned_department: result.department,
        priority: result.priority,
        status: 'Pending',
        user_id: userId,
        attachment: attachmentUrl ? { url: attachmentUrl, fileType } : undefined
      })
      await doc.save()

      res.json({ 
        category: result.category, 
        confidence: Number(result.confidence.toFixed(4)),
        department: result.department,
        priority: result.priority,
        classifiedBy: result.classifiedBy,
        id: doc._id
      })
    } catch (e) {
      console.error('Predict error:', e)
      res.status(500).json({ error: 'Classification failed. Please try again.' })
    }
  })

  return router
}