// 菜品管理
const express = require('express')
const router = express.Router()
const familyController = require('@/controllers/modules/family')
const validateMiddleware = require('@/middlewares/validateMiddleware')
const familyValidation = require('@/validations/modules/family')
const { createFamily, joinFamily, getFamilyDetail, getFamilyMemberList, updateFamilyAvatar, createInvitationCode, getInvitationDetail } = familyController

// 获取家庭列表
// router.get('/getList', getDishList)

// 创建家庭
router.post('/create', createFamily)

// 获取家庭详情
router.get('/getDetail/:id', getFamilyDetail)

// 获取家庭成员列表
router.get('/getMemberList/:id', getFamilyMemberList)

// 更新家庭头像
router.put('/updateAvatar', validateMiddleware(familyValidation.updateFamilyAvatar), updateFamilyAvatar)

// 创建邀请码
router.post('/invitation/create', validateMiddleware(familyValidation.createInvitationCode), createInvitationCode)

// 获取邀请信息
router.post('/invitation/getDetail', validateMiddleware(familyValidation.getInvitationDetail), getInvitationDetail)

// 加入家庭(使用邀请码)
router.post('/invitation/join', validateMiddleware(familyValidation.joinFamily), joinFamily)

module.exports = router
