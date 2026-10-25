// 附件管理
const express = require('express')
const router = express.Router()
const attachmentController = require('@/controllers/common/attachment')
const { addAttachment } = attachmentController

// 获取附件列表
// router.get('/getList', getAttachment)

// 添加附件(保存附件元数据)：支持批量
router.post('/add', addAttachment)

module.exports = router
