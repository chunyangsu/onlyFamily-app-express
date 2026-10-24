const express = require('express')
const router = express.Router()

const ossController = require('@/controllers/common/oss')

const { getUploadPolicy } = ossController

// 获取上传凭证
router.post('/getUploadPolicy', getUploadPolicy)

module.exports = router
