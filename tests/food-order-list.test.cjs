const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ orders = [], members = [], attachments = [], attachmentError } = {}) {
  const calls = { orders: [], members: [], attachments: [] }
  const models = {
    foodOrderList: {
      async findAll(query) {
        calls.orders.push(query)
        return orders.map((order) => ({ toJSON: () => order }))
      }
    },
    foodOrderDetails: {},
    familyUserMap: {
      async findAll(query) {
        calls.members.push(query)
        return members
      }
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/foodMenu/foodOrder.js'), 'utf8'), {
    module,
    require(name) {
      if (name === '@/models') return models
      if (name === '@/utils/codeRule') return {}
      if (name === '@/services/common/attachment')
        return {
          async getAttachmentList(ids) {
            calls.attachments.push(Array.from(ids))
            if (attachmentError) throw attachmentError
            return attachments
          }
        }
      throw new Error('Unexpected import: ' + name)
    }
  })
  return { service: module.exports, calls }
}
const plain = (value) => JSON.parse(JSON.stringify(value))

test('按当前家庭和创建人批量读取资料，去重获取头像与菜品 URL，去掉 creator', async () => {
  const { service, calls } = fixture({
    orders: [
      { id: 1, createId: 2, dishArr: [{ id: 11, mainImageId: 7, price: '10.00', num: 2 }] },
      { id: 2, createId: '2', dishArr: [] },
      { id: 3, createId: 3, dishArr: [{ id: 12, mainImageId: 8 }] }
    ],
    members: [
      { userId: '2', nickname: '家庭昵称', userAvatarId: 7 },
      { userId: 3, nickname: '乙', userAvatarId: 9 }
    ],
    attachments: [
      { id: '7', url: 'url7', expiresTime: 1795608000000 },
      { id: 8, url: 'url8' },
      { id: 9, url: 'url9' }
    ]
  })
  const result = await service.getFoodOrderList('6')
  assert.deepEqual(plain(calls.members[0]), {
    where: { familyId: 6, userId: ['2', '3'] },
    attributes: ['userId', 'nickname', 'userAvatarId'],
    raw: true
  })
  assert.deepEqual(calls.attachments, [['7', '8', '9']])
  assert.equal(calls.orders[0].include.length, 1)
  assert.equal(calls.orders[0].include[0].as, 'dishArr')
  assert.deepEqual(plain(result[0].createUser), { id: 2, nickname: '家庭昵称', avatarId: 7, avatarUrl: 'url7', expiresTime: 1795608000000 })
  assert.equal(result[1].createUser.nickname, '家庭昵称')
  assert.equal(result[2].createUser.avatarUrl, 'url9')
  assert.equal(result[0].dishArr[0].mainImageUrl, 'url7')
  assert.equal(result[0].dishArr[0].expiresTime, 1795608000000)
  assert.equal(result[0].dishArr[0].price, '10.00')
  assert.ok(result.every((order) => !Object.hasOwn(order, 'creator')))
})

test('空订单不查询成员或附件，无头像和成员缺失时返回默认资料', async () => {
  const empty = fixture()
  assert.deepEqual(plain(await empty.service.getFoodOrderList(1)), [])
  assert.equal(empty.calls.members.length, 0)
  assert.equal(empty.calls.attachments.length, 0)
  const { service, calls } = fixture({
    orders: [
      { createId: 2, dishArr: [] },
      { createId: 3, dishArr: [] }
    ],
    members: [{ userId: 2, nickname: '甲', userAvatarId: 0 }]
  })
  const result = await service.getFoodOrderList(1)
  assert.deepEqual(plain(result[0].createUser), { id: 2, nickname: '甲', avatarId: 0, avatarUrl: '', expiresTime: null })
  assert.deepEqual(plain(result[1].createUser), { id: 3, nickname: '', avatarId: 0, avatarUrl: '', expiresTime: null })
  assert.equal(calls.attachments.length, 0)
})

test('头像附件缺失返回空 URL，附件异常向上传递', async () => {
  const config = {
    orders: [{ createId: 2, dishArr: [] }],
    members: [{ userId: 2, nickname: '甲', userAvatarId: 7 }],
    attachments: [{ id: 7, url: null }]
  }
  const missing = fixture(config)
  assert.equal((await missing.service.getFoodOrderList(1))[0].createUser.avatarUrl, '')
  const failed = fixture({ ...config, attachmentError: new Error('签名失败') })
  await assert.rejects(failed.service.getFoodOrderList(1), /签名失败/)
})

test('缺少或非法家庭 ID 时拒绝读取，防止查询到其他家庭资料', async () => {
  const { service, calls } = fixture()
  for (const id of [undefined, null, '', 'undefined', 0, -1, '1.5', [], {}, 2147483648]) {
    await assert.rejects(service.getFoodOrderList(id), (error) => error.status === 400)
  }
  assert.equal(calls.orders.length, 0)
})

test('Controller 将请求头中的家庭 ID 传给 Service', async () => {
  const calls = []
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/controllers/modules/foodMenu/foodOrder.js'), 'utf8'), {
    module,
    require(name) {
      if (name === '@/services/modules/foodMenu/foodOrder')
        return {
          async getFoodOrderList(id) {
            calls.push(id)
            return ['result']
          }
        }
      if (name === '@/utils/asyncHandler') return (handler) => handler
      if (name === '@/utils/responseHandler')
        return {
          success(res, body) {
            res.body = body
          }
        }
      if (name === '@/data/enum/code') return {}
      throw new Error('Unexpected import: ' + name)
    }
  })
  const res = {}
  await module.exports.getFoodOrderList({ headers: { 'family-id': '6' } }, res)
  assert.deepEqual(calls, ['6'])
  assert.deepEqual(res.body, ['result'])
})
