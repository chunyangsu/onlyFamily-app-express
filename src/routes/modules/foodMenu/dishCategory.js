// 用户管理
const express = require('express')
const router = express.Router()
const dishCategoryController = require('@/controllers/modules/foodMenu/dishCategory')
const { getDishCategoryList, createDishCategory } = dishCategoryController

// 获取菜品分类列表
router.get('/getList', getDishCategoryList)

// 创建菜品分类
router.post('/create', createDishCategory)

module.exports = router
