const redisKeys = {
  food: {
    dishList: (familyId) => `food:dish:list:${familyId}`,
    dishCategory: (familyId) => `food:dishCategory/list:${familyId}`,
    dishDetail: (familyId, dishId) => `food:dish:detail:${familyId}:${dishId}`
  },

  family: {
    // memberList: (familyId) => `family:member:list:${familyId}`,
    detail: (familyId) => `family:detail:${familyId}`
  }
}

module.exports = redisKeys
