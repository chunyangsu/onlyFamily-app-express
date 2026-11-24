const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

async function start({ nodeEnv = 'development', authError, syncError, closeError } = {}) {
  const calls = []
  const errors = []
  const process = {}
  const app = {
    use() {},
    set() {},
    listen() {
      calls.push('listen')
    }
  }
  const express = Object.assign(() => app, { json() {} })
  const imports = {
    'module-alias/register': {},
    '@/config/env': { app: { nodeEnv, port: 3000 } },
    express,
    '@/routes': {},
    '@/models': {
      sequelize: {
        async authenticate() {
          calls.push('authenticate')
          if (authError) throw authError
        },
        async sync(options) {
          assert.equal(options.alter, true)
          calls.push('sync')
          if (syncError) throw syncError
        },
        async close() {
          calls.push('close')
          if (closeError) throw closeError
        }
      }
    },
    '@/middlewares/errorMiddleware': {},
    '@/logger/requestLoggerMiddleware': {}
  }
  await vm.runInNewContext(readFileSync(resolve(__dirname, '../src/app.js'), 'utf8'), {
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    },
    process,
    console: {
      error(...args) {
        errors.push(args)
      }
    }
  })
  return { calls, errors, process }
}

test('development listens only after authentication and sync succeed', async () => {
  const result = await start()
  assert.deepEqual(result.calls, ['authenticate', 'sync', 'listen'])
  assert.equal(result.process.exitCode, undefined)
})

test('authentication failure closes the connection without starting HTTP', async () => {
  const error = new Error('authentication failed')
  const result = await start({ authError: error })
  assert.deepEqual(result.calls, ['authenticate', 'close'])
  assert.equal(result.process.exitCode, 1)
  assert.equal(result.errors[0][1], error)
})

test('sync failure closes the connection without starting HTTP', async () => {
  const error = new Error('sync failed')
  const result = await start({ syncError: error })
  assert.deepEqual(result.calls, ['authenticate', 'sync', 'close'])
  assert.equal(result.process.exitCode, 1)
  assert.equal(result.errors[0][1], error)
})

test('close failure still prevents HTTP startup', async () => {
  const result = await start({ syncError: new Error('sync failed'), closeError: new Error('close failed') })
  assert.deepEqual(result.calls, ['authenticate', 'sync', 'close'])
  assert.equal(result.process.exitCode, 1)
  assert.equal(result.errors.length, 2)
})

test('production does not automatically alter tables', async () => {
  const result = await start({ nodeEnv: 'production' })
  assert.deepEqual(result.calls, ['authenticate', 'listen'])
})

test('openid uses one explicitly named unique index instead of column-level UNIQUE', () => {
  const { Sequelize, DataTypes } = require('sequelize')
  const sequelize = new Sequelize('test', 'test', 'test', { dialect: 'mysql', logging: false })
  const module = { exports: {} }
  vm.runInNewContext(readFileSync(resolve(__dirname, '../src/models/modules/userList.js'), 'utf8'), {
    module,
    require(name) {
      if (name === 'sequelize') return { DataTypes }
      if (name === '@/config/database') return sequelize
      throw new Error(`Unexpected import: ${name}`)
    }
  })
  const model = module.exports
  assert.equal(model.rawAttributes.openid.unique, undefined)
  assert.equal(model.options.indexes.length, 1)
  assert.equal(model.options.indexes[0].name, 'openid')
  assert.equal(model.options.indexes[0].unique, true)
  assert.deepEqual(Array.from(model.options.indexes[0].fields), ['openid'])
  const query = sequelize.getQueryInterface().queryGenerator
  const column = query.attributeToSQL(model.rawAttributes.openid)
  assert.doesNotMatch(column, /UNIQUE/i)
})
