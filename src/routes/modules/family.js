// 菜品管理
const express = require('express')
const router = express.Router()
const familyController = require('@/controllers/modules/family')
const { createFamily, joinFamily } = familyController

// 获取菜品列表
// router.get('/getList', getDishList)

// 创建家庭
router.post('/create', createFamily)

// 加入家庭
router.post('/join', joinFamily)

module.exports = router
