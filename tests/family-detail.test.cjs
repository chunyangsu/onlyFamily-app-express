const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ family, avatarUrl = 'https://example.com/signed-family-avatar', attachmentError } = {}) {
  const calls = { details: [], attachments: [] }
  const imports = {
    '@/models': {
      familyList: {
        async findByPk(id, options) {
          calls.details.push({ id, options })
          return family ? { toJSON: () => ({ ...family }) } : null
        }
      }
    },
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        calls.attachments.push(Array.from(ids))
        if (attachmentError) throw attachmentError
        return [{ id: ids[0], url: avatarUrl }]
      }
    }
  }
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/services/modules/family.js'), 'utf8'), {
    module,
    exports: module.exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    }
  })
  return { service: module.exports, calls }
}

const family = { id: 2, name: '我的家庭', introduction: '家庭简介', avatarId: 7, createId: 1, createTime: 123456 }

test('家庭详情返回查询字段，存在 avatarId 时获取对应签名 URL', async () => {
  const { service, calls } = fixture({ family })
  const result = await service.getFamilyDetail('2')
  assert.equal(
    JSON.stringify(result),
    JSON.stringify({ id: 2, name: '我的家庭', introduction: '家庭简介', avatarId: 7, avatarUrl: 'https://example.com/signed-family-avatar', createId: 1, createTime: 123456 })
  )
  assert.equal(calls.details[0].id, '2')
  assert.equal(JSON.stringify(calls.details[0].options.attributes), JSON.stringify(['id', 'name', 'introduction', 'avatarId', 'createId', 'createTime']))
  assert.deepEqual(calls.attachments, [[7]])
})

test('家庭没有头像时返回空 URL，不查询附件', async () => {
  const { service, calls } = fixture({ family: { ...family, avatarId: 0 } })
  const result = await service.getFamilyDetail(2)
  assert.equal(result.avatarId, 0)
  assert.equal(result.avatarUrl, '')
  assert.equal(calls.attachments.length, 0)
})

test('家庭不存在时返回 null，不查询附件', async () => {
  const { service, calls } = fixture()
  assert.equal(await service.getFamilyDetail(9), null)
  assert.equal(calls.attachments.length, 0)
})

test('头像附件不存在时返回空 URL，签名异常时向上传递', async () => {
  const missing = fixture({ family, avatarUrl: null })
  assert.equal((await missing.service.getFamilyDetail(2)).avatarUrl, '')

  const error = new Error('OSS unavailable')
  const failed = fixture({ family, attachmentError: error })
  await assert.rejects(failed.service.getFamilyDetail(2), (result) => result === error)
})
