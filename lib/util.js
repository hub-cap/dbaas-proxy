/**
 * Returns a random port between 1024 and 65535, inclusive
 */
function generatePort() {
  return getRandomNumber(1024, 65535);
};

/**
 * Returns a random positive ineger between min and max.
 */
function getRandomNumber(min, max) {
  // ~~() negative-safe truncate magic
  return ~~(Math.random() * (max - min) + min);
};

/**
 * Helper function to retry calls. you give it the numTimes, thisArg,
 * the call you want to execute and the args you want to pass to that
 * call. It will call it N times, and if it errors all N times, itll
 * pass back that error to you in the form of a callback. If it does
 * not fail one of those N times, it will pass you back (null, data)
 * from the call it was attempting to make.
 */
function retryCall(numTimes, thisArg, callback) {
  var theArgs = arguments;
  // grab the callback function, assuming (err, data) as the callback
  var lastArg = arguments[arguments.length-1];
  values = Array.prototype.slice.call(arguments, 3, arguments.length-1);

  values.push(function(err, data) {
    if (err) {
      console.log("an error occurred, but trying again");
      console.log(err);
      var newNumTimes = theArgs[0] - 1;
      if (newNumTimes > 0) {
        theArgs[0] = newNumTimes;
        retryCall.apply(thisArg, Array.prototype.slice.call(theArgs));
      } else {
        theArgs = null;
        lastArg = null;
      }
    } else {
      lastArg(null, data);
      theArgs = null;
      lastArg = null;
    }
  });

  // console.log("attempting to call", callback, "with", values);

  callback.apply(thisArg, values);
}

module.exports.generatePort = generatePort
module.exports.retryCall = retryCall
