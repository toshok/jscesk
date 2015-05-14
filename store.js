import { CNull, CUndefined } from './concrete';
import { error, unimplemented } from './utils';
import { Pointer } from './pointer';

export class Store {
    constructor() {
        this._store = Object.create(null);
    }

    get(addr) {
        if (addr.value === 0)
            return new CNull();
        return this._store[addr.value] || new CUndefined();
    }
    
    set(addr, val) {
        if (addr.value === 0)
            error("can't set NullPointer's value");
        if (addr.value in this._store)
            this._store[addr.value] = val;
        else
            unimplemented("set() of addr not in store");
    }

    // in-place extend, used to populate the initial environment, and
    // probably shouldn't be used anywhere else.
    _extend(addr, val) {
        this._store[addr.value] = val;
    }

    static clone(store) {
        let rv = new Store();
        for (let k of Object.getOwnPropertyNames(store._store)) {
            rv._store[k] = store._store[k];
        }
        return rv;
    }

    static extend(store, addr, val) {
        let rv = Store.clone(store);
        rv._store[addr.value] = val;
        return rv;
    }
    
    toString() {
        let rv = "Store(\n";
        for (let k of Object.getOwnPropertyNames(this._store)) {
            rv += `  ${k} -> ${this._store[k]}\n`;
        }
        rv += ")";
        return rv;
    }

    static get NullPointer() { return Object.create(Pointer.prototype, { value: { writable: false, configurable: false, value: 0 } }); }
}
