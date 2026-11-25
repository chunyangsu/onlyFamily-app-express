const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ order = null, member = null, attachments = [], attachmentError } = {}) {
  const calls = { orders: [], members: [], attachments: [] }
  const models = {
    foodOrderList: {
      async findByPk(id, query) {
        calls.orders.push({ id, query })
        return order ? { toJSON: () => order } : null
      }
    },
    foodOrderDetails: {},
    familyUserMap: {
      async findOne(query) {
        calls.members.push(query)
        return member
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

test('detail returns family-specific createUser alongside dishes without creator', async () => {
  const { service, calls } = fixture({
    order: { id: 1, code: 'ORDER1', createId: 2, dishArr: [{ id: 11, mainImageId: 7, price: '10.00', num: 2 }] },
    member: { userId: 2, nickname: 'Family nickname', userAvatarId: '8' },
    attachments: [
      { id: '7', url: 'dish-url', urlExpiresAt: 1795608000000 },
      { id: 8, url: 'avatar-url', urlExpiresAt: 1795608000000 }
    ]
  })
  const result = await service.getFoodOrderDetail({ familyId: '6', id: '1' })
  assert.equal(calls.orders[0].id, '1')
  assert.deepEqual(plain(calls.members[0]), {
    where: { familyId: 6, userId: 2 },
    attributes: ['userId', 'nickname', 'userAvatarId'],
    raw: true
  })
  assert.deepEqual(calls.attachments, [['7', '8']])
  assert.equal(calls.orders[0].query.include.length, 1)
  assert.equal(calls.orders[0].query.include[0].as, 'dishArr')
  assert.deepEqual(plain(result.createUser), { id: 2, nickname: 'Family nickname', avatarId: '8', avatarUrl: 'avatar-url', urlExpiresAt: 1795608000000 })
  assert.equal(result.dishArr[0].mainImageUrl, 'dish-url')
  assert.equal(result.dishArr[0].urlExpiresAt, 1795608000000)
  assert.equal(result.dishArr[0].price, '10.00')
  assert.equal(result.code, 'ORDER1')
  assert.equal(Object.hasOwn(result, 'creator'), false)
})

test('missing order returns null without reading members or attachments', async () => {
  const { service, calls } = fixture()
  assert.equal(await service.getFoodOrderDetail({ familyId: 1, id: 9 }), null)
  assert.equal(calls.members.length, 0)
  assert.equal(calls.attachments.length, 0)
})

test('missing member or avatar returns defaults without an unnecessary attachment query', async () => {
  for (const member of [null, { nickname: 'Name', userAvatarId: 0 }]) {
    const { service, calls } = fixture({ order: { createId: 2, dishArr: [] }, member })
    const result = await service.getFoodOrderDetail({ familyId: 1, id: 1 })
    assert.deepEqual(plain(result.createUser), { id: 2, nickname: member?.nickname || '', avatarId: 0, avatarUrl: '', urlExpiresAt: null })
    assert.equal(calls.attachments.length, 0)
  }
})

test('deduplicates shared avatar and dish attachment IDs; missing URLs are empty', async () => {
  const { service, calls } = fixture({
    order: { createId: 2, dishArr: [{ mainImageId: 7 }, { mainImageId: '7' }] },
    member: { userAvatarId: '7' }
  })
  const result = await service.getFoodOrderDetail({ familyId: 1, id: 1 })
  assert.deepEqual(calls.attachments, [['7']])
  assert.equal(result.createUser.avatarUrl, '')
  assert.ok(result.dishArr.every((dish) => dish.mainImageUrl === ''))
})

test('attachment errors propagate', async () => {
  const { service } = fixture({
    order: { createId: 2, dishArr: [] },
    member: { userAvatarId: 7 },
    attachmentError: new Error('signing failed')
  })
  await assert.rejects(service.getFoodOrderDetail({ familyId: 1, id: 1 }), /signing failed/)
})

test('invalid family IDs fail before querying', async () => {
  const { service, calls } = fixture()
  for (const familyId of [undefined, null, '', 'undefined', 0, -1, '1.5', [], {}, 2147483648]) {
    await assert.rejects(service.getFoodOrderDetail({ familyId, id: 1 }), (error) => error.status === 400)
  }
  assert.equal(calls.orders.length, 0)
})
