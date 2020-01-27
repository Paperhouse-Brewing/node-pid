/**
 * [Paperhouse Brewing Header]
 * Modified By: Richard P. Gonzales <richard@paperhousebrewing.com>
 *
 * This is a ported and modified version of the node-red-contrib-pid
 * https://github.com/colinl/node-red-contrib-pid
 *
 * I mainly chose to use this because of previous experience and it
 * being a VERY smooth system that operates the vessels I'm running
 * it against. This basically removed it as a node-red only node and
 * made it a generic node-js module that can be used outside of node-red.
 *
 *
 * [Original Header]
 * Copyright 2016 Colin Law
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

const events = require('events');
const EventEmitter =  events.EventEmitter;

"use strict";

class Node_PID extends EventEmitter {
	constructor(config) {
		super();

		this._pv = "undefined";
		this._setpoint = Number(config.setpoint);
		this._enable = Number(config.enable);
		this._prop_band = Number(config.pb);
		this._t_integral = Number(config.ti);
		this._t_derivative = Number(config.td);
		this._integral_default = Number(config.integral_default);
		this._smooth_factor = Number(config.smooth_factor);
		this._max_interval = Number(config.max_interval);
		this._disabled_op = Number(config.disabled_op);
		// sanitise disabled output as this is used when all else fails
		if (isNaN(this._disabled_op)) {
			this._disabled_op = 0;
		}
	}

	get setpoint() {
		return me._setpoint;
	}

	set setpoint(val) {
		me._setpoint = Number(val);
	}

	get enable() {
		return this._enable;
	}

	set enable(val) {
		me._enable = Number(msg.enable);
	}

	get prop_band() {
		return this._prop_band;
	}

	set prop_band(val) {
		me._prop_band = Number(msg.prop_band);
	}

	get t_integral() {
		return this._t_integral;
	}

	set t_integral(val) {
		me._t_integral = Number(msg.t_integral);
	}

	get t_derivative() {
		return this._t_derivative;
	}

	set t_derivative(val) {
		me._t_derivative = Number(msg.t_derivative);
	}

	get smooth_factor() {
		return this._smooth_factor;
	}

	set smooth_factor(val) {
		me._smooth_factor = Number(msg.smooth_factor);
	}

	get max_interval() {
		reutnr this._max_interval;
	}

	set max_interval(val) {
		me._max_interval = Number(msg.max_interval);
	}

	get disabled_op() {
		return this._disabled_op;
	}

	set disabled_op(val) {
		me._disabled_op = Number(msg.disabled_op);
		// sanitise disabled output as this is used when all else fails
		if (isNaN(me._disabled_op)) {
			me._disabled_op = 0;
		}
	}

	get integral_default() {
		return this._integral_default;
	}

	set integral_default(val) {
		me._integral_default = Number(msg.integral_default);
	}

	get pv() {
		return this._pv;
	}

	set pv(val) {
		me.pv = Number(msg.payload);   	// this may give NaN which is handled in runControlLoop
		this.emit("runControlLoop", this.runControlLoop());	// Everytime the set pv runs we need to fire runControlLoop and fire the data back
	}

	runControlLoop() {
		//node.log("pv, setpoint, prop_band, t_integral, t_derivative, integral_default, smooth_factor, max_interval, enable, disabled_op");
		//node.log(node.pv + " " + node.setpoint + " " + node.prop_band + " " + node.t_integral + " " + node.t_derivative + " " + node.integral_default + " " + node.smooth_factor + " " + node.max_interval + " " + node.enable + " " + node.disabled_op);
		let me = this;
		let ans;
		// check we have a good pv value
		if (!isNaN(me.pv) && isFinite(me.pv)) {
			// even if we are disabled (enable == 0 or false) then run through the calcs to keep the derivative up to date
			// but lock the integral and set power to appropriate value at the end
			let time = Date.now();
			let integral_locked = false;
			let factor;
			if (me.last_sample_time) {
				let delta_t = (time - me.last_sample_time)/1000;  // seconds
				if (delta_t <= 0 || delta_t > me._max_interval) {
					// too long since last sample so leave integral as is and set deriv to zero
					//me.status({fill:"red",shape:"dot",text:"Too long since last sample"});
					me.derivative = 0
				} else {
					if (me._smooth_factor > 0) {
						// A derivative smoothing factor has been supplied
						// smoothing time constant is td/factor but with a min of delta_t to stop overflows
						let ts = Math.max(me._t_derivative/me._smooth_factor, delta_t);
						factor = 1.0/(ts/delta_t);
					} else {
						// no integral smoothing so factor is 1, this makes smoothed_value the previous pv
						factor = 1.0;
					}
					let delta_v = (me.pv - me.smoothed_value) * factor;
					me.smoothed_value = me.smoothed_value + delta_v
					//node.log( "factor " + factor.toFixed(3) + " delta_t " + delta_t + " delta_v " + delta_v.toFixed(3) +
					//  " smoothed " + node.smoothed_value.toFixed(3));
					me.derivative = me._t_derivative * delta_v/delta_t;

					// lock the integral if abs(previous integral + error) > prop_band/2
					// as this means that P + I is outside the linear region so power will be 0 or full
					// also lock if control is disabled
					let error = me.pv - me._setpoint;
					let pbo2 = me._prop_band/2.0;
					if ((Math.abs(error + me.integral) < pbo2)  && me._enable) {
						integral_locked = false;
						if (me._t_integral <= 0) {
							// t_integral is zero (or silly), set integral to one end or the other
							// or half way if exactly on sp
							me.integral = Math.sign(error) * pbo2;
						} else {
							me.integral = me.integral + error * delta_t/me._t_integral;
						}
					} else {
						//node.log("Locking integral");
						integral_locked = true;
					}
					// clamp to +- 0.5 prop band widths so that it cannot push the zero power point outside the pb
					// do this here rather than when integral is updated to allow for the fact that the pb may change dynamically
					if ( me.integral < -pbo2 ) {
						me.integral = -pbo2;
					} else if (me.integral > pbo2) {
						me.integral = pbo2;
					}
				}

			} else {
				// first time through so initialise context data
				me.smoothed_value = me.pv;
				// setup the integral term so that the power out would be integral_default if pv=setpoint
				me.integral = (0.5 - me._integral_default)*me._prop_band;
				me.derivative = 0.0;
				me.last_power = 0.0;  // power last time through
			}

			let proportional = me.pv - me._setpoint;
			if (me._prop_band == 0) {
				// prop band is zero so drop back to on/off control with zero hysteresis
				if (proportional > 0) {
					power = 0.0;
				} else if (proportional < 0) {
					power = 1.0;
				} else {
					// exactly on sp so leave power as it was last time round
					power = me.last_power;
				}
			} else {
				let power = -1.0/me._prop_band * (proportional + me.integral + me.derivative) + 0.5;
			}
			// set power to disabled value if the loop is not enabled
			if (!me._enable) {
				power = me._disabled_op;
				//me.status({fill:"yellow",shape:"dot",text:"Disabled"});
			} else if (integral_locked) {
				//me.status({fill:"green",shape:"dot",text:"Integral Locked"});
			} else {
				//me.status({fill:"green",shape:"dot"});
			}
			me.last_sample_time = time;
		} else {
			// pv is not a good number so set power to disabled value
			power = me._disabled_op;
			//me.status({fill:"red",shape:"dot",text:"Bad PV"});
		}
		// if NaN vaues have been entered for params or something drastic has gone wrong
		// then set power to disabled value
		if (isNaN(power)) {
			power = me._disabled_op;
		}

		if (power < 0.0) {
			power = 0.0;
		} else if (power > 1.0) {
			power = 1.0;
		}

		me.last_power = power;
		ans =  {
			payload: power,
			pv: me.pv,
			setpoint: me._setpoint,
			proportional: proportional,
			integral: me.integral,
			derivative: me.derivative,
			smoothed_value: me.smoothed_value
		}
		return ans;
	}
}

module.exports = Node_PID;

  

