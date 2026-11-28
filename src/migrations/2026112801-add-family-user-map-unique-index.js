module.exports = {
  /**
   * 执行迁移：添加家庭与用户的联合唯一索引
   */
  async up({ context: queryInterface }) {
    // 执行前需确认不存在重复的 (familyId, userId)，本迁移不自动删除数据。
    await queryInterface.addIndex('family_user_map', ['familyId', 'userId'], {
      name: 'uk_family_user_map_family_user',
      unique: true
    })
  },

  /**
   * 回滚迁移：仅删除索引，保留表和数据
   */
  async down({ context: queryInterface }) {
    await queryInterface.removeIndex('family_user_map', 'uk_family_user_map_family_user')
  }
}
