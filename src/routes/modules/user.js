// 用户管理
const express = require('express')
const router = express.Router()
const user = require('@/controllers/modules/user')
// 获取用户列表
// router.get('/getList', (req, res) => {
//   res.json({ message: '获取所有用户1', data: [] })
// })
router.get('/getList', user.getList)

// 获取单个用户
// router.get('/:id', (req, res) => {
//   const { id } = req.params
//   res.json({ message: `获取用户 ${id}`, data: {} })
// })

// 创建用户
// router.post('/', (req, res) => {
//   res.status(201).json({ message: '创建用户成功' })
// })

module.exports = router
