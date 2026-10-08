// 菜品管理
const express = require('express')
const router = express.Router()
const dishController = require('@/controllers/modules/foodMenu/dish')
const { getDishList, createDish } = dishController

// 获取菜品列表
router.get('/getList', getDishList)

// 创建菜品
router.post('/create', createDish)

module.exports = router
