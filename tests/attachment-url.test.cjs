const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function load(file, imports) {
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '..', file), 'utf8'), {
    module,
    require(name) {
      if (!(name in imports)) throw new Error('Unexpected import: ' + name)
      return imports[name]
    }
  })
  return module.exports
}

test('附件列表返回 URL 到期时间，保留请求顺序及缺失附件的空值', async () => {
  const calls = []
  const service = load('src/services/common/attachment.js', {
    sequelize: { Op: { in: Symbol('in') } },
    '@/models': { attachmentList: { findAll: async () => [{ id: 7, objectKey: 'avatar', module: 'user', moduleType: 'avatar' }] } },
    '@/config/oss': {
      getSignedOssUrl: async (key) => {
        calls.push(key)
        return { url: 'https://example.com/signed', urlExpiresAt: 1795608000000 }
      }
    }
  })
  const result = await service.getAttachmentList([7, 99, '7'])
  assert.equal(result[0].urlExpiresAt, 1795608000000)
  assert.equal(result[1].url, null)
  assert.equal(result[1].urlExpiresAt, null)
  assert.equal(result[2].id, 7)
  assert.equal(calls.length, 2)
})

test('续签沿用附件查询接口，禁止缓存返回的新地址与过期时间', async () => {
  const headers = {}
  let response
  const controller = load('src/controllers/common/attachment.js', {
    '@/services/common/attachment': { getAttachmentList: async (ids) => [{ id: ids[0], url: 'new-url', urlExpiresAt: 1795608000000 }] },
    '@/utils/asyncHandler': (fn) => fn,
    '@/utils/responseHandler': {
      success: (_res, value) => {
        response = value
      }
    },
    '@/data/enum/code': {}
  })
  await controller.getAttachmentList(
    { query: { idArr: '[7]' } },
    {
      set: (key, value) => {
        headers[key] = value
      }
    }
  )
  assert.equal(headers['Cache-Control'], 'no-store')
  assert.equal(response[0].id, 7)
  assert.equal(response[0].url, 'new-url')
  assert.equal(response[0].urlExpiresAt, 1795608000000)
})

test('菜品分页和分组均保留附件签名过期时间，无图片时返回 null', async () => {
  const dishes = [
    { id: 1, categoryId: 3, mainImageId: 7 },
    { id: 2, categoryId: 3, mainImageId: 0 }
  ]
  const service = load('src/services/modules/foodMenu/dish.js', {
    sequelize: { Op: {} },
    '@/models': {
      dishList: { findAndCountAll: async () => ({ count: 2, rows: dishes }), findAll: async () => dishes },
      dishCategoryList: { findAll: async () => [{ id: 3, name: '分类' }] }
    },
    '@/services/common/attachment': { getAttachmentList: async () => [{ id: 7, url: 'dish-url', urlExpiresAt: 1795608000000 }] }
  })
  const paged = (await service.getDishList()).list
  const grouped = (await service.getDishGroupList({})).list[0].dishList
  for (const list of [paged, grouped]) {
    assert.equal(list[0].mainImageUrl, 'dish-url')
    assert.equal(list[0].urlExpiresAt, 1795608000000)
    assert.equal(list[1].mainImageUrl, '')
    assert.equal(list[1].urlExpiresAt, null)
  }
})
