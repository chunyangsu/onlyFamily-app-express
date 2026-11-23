// 用户管理
const express = require('express')
const router = express.Router()
const userController = require('@/controllers/modules/user')
const validateMiddleware = require('@/middlewares/validateMiddleware')
const userValidation = require('@/validations/modules/user')
const { login, getUserList, updateUserAvatar, updateUserNickname } = userController

// ============ 公有接口 ============

// 登录
router.post('/login', login)

// 退出登录
// router.post('/logout', logout)

// ============ 私有接口，需要鉴权 ============

// 获取用户列表
router.get('/getList', getUserList)

// 创建用户
// router.post('/create', createUser)

// 更新用户头像
router.put('/updateAvatar', validateMiddleware(userValidation.updateUserAvatar), updateUserAvatar)

// 更新用户昵称
router.put('/updateNickname', validateMiddleware(userValidation.updateUserNickname), updateUserNickname)

// 获取单个用户
// router.get('/:id', (req, res) => {
//   const { id } = req.params
//   res.json({ message: `获取用户 ${id}`, data: {} })
// })

// 获取客户详情的路由
// router.get('/customer/detail/:id', getCustomerDetail)

// 编辑客户的路由
// router.put('/customer/', editCustomer)

// 删除客户的路由
// router.delete('/customer/:id', deleteCustomer)

module.exports = router
