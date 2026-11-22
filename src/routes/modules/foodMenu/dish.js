// 菜品管理
const express = require('express')
const router = express.Router()
const validateMiddleware = require('@/middlewares/validateMiddleware')
const dishValidation = require('@/validations/modules/food/dish')
const dishController = require('@/controllers/modules/foodMenu/dish')
const { getDishList, getDishGroupList, createDish } = dishController

// 获取菜品列表
router.get('/getList', validateMiddleware(dishValidation.getList), getDishList)

// 获取菜品列表(按菜品分类分组)
router.get('/getList/byGroup', getDishGroupList)

// 创建菜品
router.post('/create', validateMiddleware(dishValidation.create), createDish)

module.exports = router
