const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

function fixture({ members = [], attachments = [], attachmentError } = {}) {
  const calls = { queries: [], attachments: [] }
  const imports = {
    '@/utils/invitation': {},
    '@/config/env': {},
    '@/models': {
      familyUserMap: {
        async findAll(query) {
          calls.queries.push(query)
          return members
        }
      }
    },
    '@/services/common/avatarObject': {},
    '@/services/common/attachment': {
      async getAttachmentList(ids) {
        calls.attachments.push(Array.from(ids))
        if (attachmentError) throw attachmentError
        return attachments
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

test('按家庭 ID 查询全部成员，映射用户 ID、家庭昵称及头像，并批量去重读取 URL', async () => {
  const { service, calls } = fixture({
    members: [
      { id: 99, userId: 1, nickname: '成员甲', userAvatarId: 7 },
      { userId: 2, nickname: '成员乙', userAvatarId: '7' },
      { userId: 3, nickname: '成员丙', userAvatarId: 8 },
      { userId: 4, nickname: '', userAvatarId: 0 }
    ],
    attachments: [
      { id: '8', url: 'avatar-8' },
      { id: 7, url: 'avatar-7', expiresTime: 1795608000000 }
    ]
  })
  const result = await service.getFamilyMemberList('2')
  assert.equal(calls.queries[0].where.familyId, '2')
  assert.equal(calls.queries[0].raw, true)
  assert.deepEqual(Array.from(calls.queries[0].attributes), ['userId', 'nickname', 'userAvatarId'])
  assert.equal(calls.queries[0].limit, undefined)
  assert.deepEqual(calls.attachments, [['7', '8']])
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { id: 1, nickname: '成员甲', avatarId: 7, avatarUrl: 'avatar-7', expiresTime: 1795608000000 },
    { id: 2, nickname: '成员乙', avatarId: '7', avatarUrl: 'avatar-7', expiresTime: 1795608000000 },
    { id: 3, nickname: '成员丙', avatarId: 8, avatarUrl: 'avatar-8', expiresTime: null },
    { id: 4, nickname: '', avatarId: 0, avatarUrl: '', expiresTime: null }
  ])
})

test('无成员返回空数组；全部无头像时不查询附件', async () => {
  const empty = fixture()
  assert.equal(JSON.stringify(await empty.service.getFamilyMemberList(2)), '[]')
  assert.equal(empty.calls.attachments.length, 0)
  const noAvatar = fixture({
    members: [
      { userId: 1, nickname: '成员', userAvatarId: 0 },
      { userId: 2, nickname: '', userAvatarId: null }
    ]
  })
  const result = await noAvatar.service.getFamilyMemberList(2)
  assert.ok(result.every((member) => member.avatarId === 0 && member.avatarUrl === ''))
  assert.equal(noAvatar.calls.attachments.length, 0)
})

test('头像附件缺失或 URL 为空时仍返回成员及绑定 ID，URL 为空字符串', async () => {
  for (const attachments of [[], [{ id: 7, url: null }]]) {
    const { service } = fixture({ members: [{ userId: 1, nickname: '成员', userAvatarId: 7 }], attachments })
    const [member] = await service.getFamilyMemberList(2)
    assert.equal(member.id, 1)
    assert.equal(member.avatarId, 7)
    assert.equal(member.avatarUrl, '')
  }
})

test('附件读取或签名异常时向上传递，不返回伪造 URL', async () => {
  const error = new Error('OSS unavailable')
  const { service } = fixture({ members: [{ userId: 1, nickname: '成员', userAvatarId: 7 }], attachmentError: error })
  await assert.rejects(service.getFamilyMemberList(2), (result) => result === error)
})
