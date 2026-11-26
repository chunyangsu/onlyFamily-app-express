const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { Sequelize, DataTypes } = require('sequelize')

// 只定义模型，不连接数据库，也不执行表结构同步。
const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false })
const modelModule = { exports: {} }
vm.runInNewContext(readFileSync(resolve(__dirname, '../src/models/modules/familyInvitation.js'), 'utf8'), {
  module: modelModule,
  require(name) {
    if (name === 'sequelize') return { DataTypes }
    if (name === '@/config/database') return sequelize
    throw new Error(`Unexpected import: ${name}`)
  }
})
const familyInvitation = modelModule.exports
const valid = () => ({ familyId: 1, inviterId: 2, codeHash: 'a'.repeat(64), expiresTime: Date.now() + 86400000 })

test('邀请模型包含方案字段，ID 沿用 INTEGER，时间使用 BIGINT', () => {
  assert.equal(familyInvitation.name, 'familyInvitation')
  assert.equal(familyInvitation.tableName, 'family_invitation')
  assert.equal(familyInvitation.options.engine, 'InnoDB')
  assert.equal(familyInvitation.options.timestamps, false)
  const fields = familyInvitation.rawAttributes
  assert.deepEqual(Object.keys(fields), [
    'id', 'familyId', 'inviterId', 'codeHash', 'status', 'expiresTime',
    'joinerId', 'joinTime', 'createTime', 'updateTime'
  ])
  for (const key of ['id', 'familyId', 'inviterId', 'joinerId']) {
    assert.equal(fields[key].type.toSql(), 'INTEGER')
  }
  for (const key of ['expiresTime', 'joinTime', 'createTime', 'updateTime']) {
    assert.equal(fields[key].type.toSql(), 'BIGINT')
  }
  assert.equal(fields.codeHash.type.toSql(), 'CHAR(64)')
  assert.equal(fields.id.primaryKey, true)
  assert.equal(fields.id.autoIncrement, true)
})

test('哈希唯一索引和家庭邀请管理索引均显式命名', () => {
  const indexes = familyInvitation.options.indexes
  assert.equal(indexes.length, 2)
  assert.equal(indexes[0].name, 'uk_family_invitation_code_hash')
  assert.equal(indexes[0].unique, true)
  assert.deepEqual(Array.from(indexes[0].fields), ['codeHash'])
  assert.equal(indexes[1].name, 'idx_family_invitation_family_inviter_status')
  assert.deepEqual(Array.from(indexes[1].fields), ['familyId', 'inviterId', 'status'])
  assert.equal(familyInvitation.rawAttributes.codeHash.unique, undefined)
})

test('新邀请默认未使用，加入人和加入时间为空；过期时间必须显式提供', async () => {
  const invitation = familyInvitation.build(valid())
  await invitation.validate()
  assert.equal(invitation.status, 0)
  assert.equal(invitation.joinerId, null)
  assert.equal(invitation.joinTime, null)
  const data = valid()
  delete data.expiresTime
  await assert.rejects(familyInvitation.build(data).validate(), /expiresTime/)
})

test('拒绝非法状态、哈希和关联 ID，四种邀请状态均可保存', async () => {
  for (const status of [0, 1, 2, 3]) {
    await familyInvitation.build({ ...valid(), status }).validate()
  }
  for (const values of [
    { status: 4 }, { codeHash: '原始邀请凭证' }, { codeHash: 'g'.repeat(64) },
    { familyId: 0 }, { inviterId: -1 }, { joinerId: 0 },
    { expiresTime: 0 }, { joinTime: -1 }
  ]) {
    await assert.rejects(familyInvitation.build({ ...valid(), ...values }).validate(), { name: 'SequelizeValidationError' })
  }
})

test('单条创建和更新钩子维护毫秒时间戳，不改变过期时间', async () => {
  const invitation = familyInvitation.build(valid())
  const expiresTime = invitation.expiresTime
  const before = Date.now()
  await familyInvitation.runHooks('beforeCreate', invitation)
  assert.ok(invitation.createTime >= before && invitation.createTime <= Date.now())
  const createTime = invitation.createTime
  await familyInvitation.runHooks('beforeUpdate', invitation)
  assert.ok(invitation.updateTime >= before && invitation.updateTime <= Date.now())
  assert.equal(invitation.createTime, createTime)
  assert.equal(invitation.expiresTime, expiresTime)
})
