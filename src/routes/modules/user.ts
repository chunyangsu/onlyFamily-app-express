import { Router } from 'express'
import { User } from '../../controllers/modules/user'

const router: Router = Router()
const { getUserList } = User

// 定义路由
router.get('/get', getUserList)

export default router
