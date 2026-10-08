// 食物订单管理
const express = require('express')
const router = express.Router()
const foodOrderController = require('@/controllers/modules/foodMenu/foodOrder')
const { getFoodOrderList, createFoodOrder } = foodOrderController

// 获取食物订单列表
router.get('/getList', getFoodOrderList)

// 创建食物订单
router.post('/create', createFoodOrder)

module.exports = router
