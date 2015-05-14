
// pointers (and frame pointers, which form our Environment), along with our Store
let maxPointer = 0;
export function Pointer() {
    this.value = ++maxPointer;
}
Pointer.prototype.toString = function() {
    return `Pointer(${this.value})`;
};

export function resetPointers() {
    maxPointer = 0;
}

