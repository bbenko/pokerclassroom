/* Calculations stay off the UI thread. No requests to a game server. */
'use strict';
importScripts('./engine.js');
let trainer;
self.onmessage = ({data: {id, path, body = {}}}) => {
  try {
    let state, warning;
    if (path === 'init') {
      try { trainer = body.saved ? PokerClassroom.Trainer.restore(body.saved) : new PokerClassroom.Trainer(); }
      catch { trainer = new PokerClassroom.Trainer(); warning = 'Saved progress could not be loaded. A new table is ready.'; }
      state = trainer.state();
    } else {
      if (!trainer) throw Error('The table is still loading.');
      if (path === 'history') { self.postMessage({id, history: trainer.session_history()}); return; }
      if (path === 'reset') state = trainer.reset_session();
      else if (path === 'state') state = trainer.state();
      else if (path === 'new') state = trainer.new_hand(body.stack_mode ?? null);
      else if (path === 'action') state = trainer.act(body.action, body.size);
      else if (path === 'range') state = trainer.reveal_range();
      else if (path === 'hints') {
        if (typeof body.enabled !== 'boolean') throw Error('Choose whether to show the coach.');
        trainer.hints = body.enabled; state = trainer.state();
      } else throw Error('Unknown table action.');
    }
    self.postMessage({id, state, saved: trainer.snapshot(), warning});
  } catch (error) { self.postMessage({id, error: error.message}); }
};
