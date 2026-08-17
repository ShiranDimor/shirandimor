export type ProfileId = 'not_started' | 'burned_before' | 'no_structure' | 'emotion_driven' | 'wants_consistency';

// Q1 היא האיתות הכי חזק (עד 10 נק'), שאר השאלות משמשות לחידוד/שבירת שוויון
export function classifyProfile(answers: Record<string, unknown>): ProfileId {
  const scores: Record<ProfileId, number> = {
    not_started: 0,
    burned_before: 0,
    no_structure: 0,
    emotion_driven: 0,
    wants_consistency: 0,
  };

  const add = (id: ProfileId, points: number) => { scores[id] += points; };

  switch (answers.trading_experience) {
    case 'not_started': add('not_started', 10); break;
    case 'tried_stopped': add('burned_before', 8); break;
    case 'trading_inconsistent': add('no_structure', 4); add('emotion_driven', 4); break;
    case 'trading_improve': add('wants_consistency', 8); break;
  }

  switch (answers.self_talk) {
    case 'tried_didnt_work': add('burned_before', 5); break;
    case 'hard_to_believe': add('burned_before', 3); break;
    case 'keep_searching_method': add('no_structure', 5); break;
    case 'know_but_dont_execute': add('emotion_driven', 5); break;
    case 'rush_to_succeed': add('emotion_driven', 3); break;
    case 'want_but_not_ready': add('not_started', 3); break;
    case 'no_time': add('not_started', 2); break;
  }

  switch (answers.money_fear) {
    case 'tried_before_hard_to_believe': add('burned_before', 4); break;
    case 'emotions_take_over': add('emotion_driven', 4); break;
    case 'dont_understand_enough': add('no_structure', 3); break;
    case 'not_enough_capital': add('not_started', 2); break;
  }

  if (answers.strategy_clarity === 'not_really' || answers.strategy_clarity === 'mixed') {
    add('no_structure', 3);
  }
  if (answers.strategy_clarity === 'very_clear' || answers.strategy_clarity === 'mostly') {
    add('emotion_driven', 2); add('wants_consistency', 2);
  }

  switch (answers.losing_trade_behavior) {
    case 'want_revenge':
    case 'hard_to_close':
    case 'give_more_room':
      add('emotion_driven', 4); break;
    case 'search_other_method':
      add('no_structure', 4); break;
    case 'follow_plan':
      add('wants_consistency', 5); break;
  }

  switch (answers.winning_trade_behavior) {
    case 'take_profit_early_fear':
    case 'change_target':
    case 'turns_to_loss':
      add('emotion_driven', 3); break;
    case 'follow_plan':
      add('wants_consistency', 4); break;
  }

  const stopMeFrom = Array.isArray(answers.stop_me_from) ? (answers.stop_me_from as string[]) : [];
  const emotionalHabits = ['move_stop', 'revenge_trade_immediately', 'trade_while_upset', 'fomo_entry'];
  add('emotion_driven', stopMeFrom.filter((v) => emotionalHabits.includes(v)).length * 2);

  // סדר שבירת שוויון קבוע - Q1 שולט ברוב המקרים כך שתיקו אמיתי נדיר
  const order: ProfileId[] = ['not_started', 'burned_before', 'emotion_driven', 'no_structure', 'wants_consistency'];
  return order.reduce((best, id) => (scores[id] > scores[best] ? id : best), order[0]);
}
