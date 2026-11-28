const { DataTypes } = require('sequelize')

// 使用独立的表结构快照，避免后续模型变更影响历史迁移
module.exports = {
  /**
   * 执行迁移：创建家庭邀请表
   */
  async up({ context: queryInterface }) {
    // 1. 创建数据表
    await queryInterface.createTable(
      'family_invitation',
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          comment: '主键 id'
        },
        familyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: '被邀请加入的家庭id'
        },
        inviterId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          comment: '邀请人用户id'
        },
        codeHash: {
          type: DataTypes.CHAR(64),
          allowNull: false,
          comment: '随机邀请凭证的SHA-256哈希，不存储原始凭证'
        },
        status: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'unused',
          comment: '邀请状态：未使用unused、已使用used、已过期expired、已撤销revoked'
        },
        expiresTime: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '过期时间，毫秒时间戳'
        },
        joinerId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '加入的用户id，未使用时为0'
        },
        joinTime: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '成功加入时间，毫秒时间戳，未使用时0'
        },
        createTime: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '创建时间，毫秒时间戳'
        },
        updateTime: {
          type: DataTypes.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '更新时间，毫秒时间戳'
        }
      },
      { engine: 'InnoDB' }
    )

    // 2. 邀请凭证哈希唯一索引
    await queryInterface.addIndex('family_invitation', ['codeHash'], {
      name: 'uk_family_invitation_code_hash',
      unique: true
    })
    // 3. 家庭、邀请人、邀请状态联合索引
    await queryInterface.addIndex('family_invitation', ['familyId', 'inviterId', 'status'], {
      name: 'idx_family_invitation_family_inviter_status'
    })
  },
  /**
   * 回滚迁移：删除家庭邀请表
   */
  async down({ context: queryInterface }) {
    // 删除表时会一并删除索引；回滚也会删除该表中的邀请数据。
    await queryInterface.dropTable('family_invitation')
  }
}
