// 菜品管理
const express = require('express')
const router = express.Router()
const familyController = require('@/controllers/modules/family')
const validateMiddleware = require('@/middlewares/validateMiddleware')
const familyValidation = require('@/validations/modules/family')
const { createFamily, joinFamily, getFamilyDetail, updateFamilyAvatar } = familyController

// 获取家庭列表
// router.get('/getList', getDishList)

// 创建家庭
router.post('/create', createFamily)

// 加入家庭
router.post('/join', joinFamily)

// 获取家庭详情
router.get('/getDetail/:id', getFamilyDetail)

// 更新家庭头像
router.put('/updateAvatar', validateMiddleware(familyValidation.updateFamilyAvatar), updateFamilyAvatar)

module.exports = router
