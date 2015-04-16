let a = 5;
function foo() {
  let unused_ = print(a);
  let func = function() {
    let unused_ = print(a);;
    return undefined;
  };
  return func;
}
let f = foo();
let unused_ = f();
