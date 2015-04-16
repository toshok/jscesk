let a = 5;
function foo() {
  let unused_ = print(a);
  return undefined;
}
let unused_ = foo();
