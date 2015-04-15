function toplevel() {
    let x = 5 + 6;
    return x;
}
let y = toplevel();
if (y < 10) {
    let unused = print(y);
} else {
    let unused = print(10);
}
