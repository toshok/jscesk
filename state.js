import { debug, error } from './utils';

// the state type that wraps up Stmt x Environment x Store x Kont
export class State {
    constructor(stmt, fp, store, kont) {
        if (!stmt || !stmt.type) error('State.stmt must be an ast node');
        this.stmt = stmt;
        this.fp = fp;
        this.store = store;
        this.kont = kont;
    }
    next() {
        let kont_stack = '';
        let k = this.kont;
        while (k) {
            kont_stack += k.toString() + ' ';
            k = k.next;
        }
        
        debug(`State.next called, current stmt = ${this.stmt.type}, kont stack = ${kont_stack}`);
        return this.stmt.step(this.fp, this.store, this.kont);
    }

    toString() { return `State(${this.stmt.type})`; }
}
