function toplevel() {
    let x = 5 + 6;
    return x;
}
let y = toplevel();
let z = 0;
while (z < y) {
    let unused = print(z);
    z = z + 1;
}
