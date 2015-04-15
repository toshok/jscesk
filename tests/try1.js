let e = "hello, world";
try {
  throw "goodbye, world";
}
catch (e) {
  let unused = print(e);
}
let unused = print(e);
