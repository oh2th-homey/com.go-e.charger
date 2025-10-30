"use strict";

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

module.exports = class GoeChargerApi {
  async getInfo() {
    // console.log(`[Device] getInfo with driver ${this.driver}`);
    try {
      if (
        this.driver === "go-eCharger_V1" ||
        this.driver === "go-eCharger_V2"
      ) {
        return Promise.resolve(await this._getInfoAPIV1());
      }
      return Promise.resolve(await this._getInfoAPIV2());
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async setGoeChargerValue(key, value) {
    // console.log(`[Device] setGoeChargerValue with driver ${this.driver}`);
    try {
      if (
        this.driver === "go-eCharger_V1" ||
        this.driver === "go-eCharger_V2"
      ) {
        if (typeof value === "boolean") value = value ? 1 : 0; // Convert boolean to numeric 1 or 0 to be used in V1 API
        return Promise.resolve(await this._setGoeChargerValueV1(key, value));
      }
      return Promise.resolve(await this._setGoeChargerValueV2(key, value));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // ------------------------------------------------------------------------
  // API V1 functions called by above mapping functions

  async _getInfoAPIV1() {
    const deviceInfo = {
      id: "",
      name: "",
      status: "unknown",
      is_allowed: false,
      is_charging: false,
      is_connected: false,
      alarm_device: false,
      meter_power: null,
      "meter_power.session": null,
      measure_current: 0,
      measure_power: 0,
      measure_voltage: 0,
      "measure_voltage.output": 0,
      energy_total: null,
      measure_temperature: null,
      cable_limit: null,
      current_limit: null,
      current_max: null,
    };

    // go-e status API V1
    const res = await this._getGoeCharger("status");
    const txt = await res.text();
    const goecharger = JSON.parse(txt);

    // Serial numner for device ID (V1 API sse)
    deviceInfo.id = goecharger.sse;

    // Friendly name for device (V1 API doesn't have it, so build from driver and serial)
    deviceInfo.name = `go-eCharger ${deviceInfo.id}`;

    // status  (V1 API car)
    switch (goecharger.car) {
      case "1":
        deviceInfo.status = "station_idle";
        break;
      case "2":
        deviceInfo.status = "car_charging";
        break;
      case "3":
        deviceInfo.status = "station_waiting";
        break;
      case "4":
        deviceInfo.status = "car_finished";
        break;
      default:
        deviceInfo.status = "unknown";
    }

    // allow (V1 API alw)
    if (goecharger.alw === "1") {
      deviceInfo.is_allowed = true;
    }

    // error (V1 API err)
    if (goecharger.err !== "0") {
      deviceInfo.alarm_device = true;
    }

    // metered power (V1 API dws)
    deviceInfo["meter_power.session"] = Number(
      (goecharger.dws * 0.00000277).toFixed(1)
    );

    // power (V1 API nrg array)
    // Filter out negative power values.
    if (goecharger.nrg[11] > 0) {
      deviceInfo.measure_power = Number((goecharger.nrg[11] * 10).toFixed(1));
    }

    // current amps (V1 API nrg array)
    // count number of active phases from current values if more than 0
    let numPhases = 0;
    if (goecharger.nrg[4] > 0) numPhases++;
    if (goecharger.nrg[5] > 0) numPhases++;
    if (goecharger.nrg[6] > 0) numPhases++;
    if (numPhases > 0)
      deviceInfo.measure_current = Number(
        (
          (goecharger.nrg[4] + goecharger.nrg[5] + goecharger.nrg[6]) /
          numPhases /
          10
        ).toFixed(1)
      );

    // voltage from connected source phases (V1 API nrg array)
    let numPhases_in = 0;
    if ((goecharger.pha & 32) === 32) {
      deviceInfo.measure_voltage = Number(goecharger.nrg[2].toFixed(1));
      numPhases_in++;
    }
    if ((goecharger.pha & 16) === 16) {
      deviceInfo.measure_voltage =
        deviceInfo.measure_voltage + Number(goecharger.nrg[1].toFixed(1));
      numPhases_in++;
    }
    if ((goecharger.pha & 8) === 8) {
      deviceInfo.measure_voltage =
        deviceInfo.measure_voltage + Number(goecharger.nrg[0].toFixed(1));
      numPhases_in++;
    }
    if (numPhases_in === 3) {
      deviceInfo.measure_voltage = Number(
        ((deviceInfo.measure_voltage / numPhases_in) * Math.sqrt(3)).toFixed(1)
      );
    }
    // check for reversed phases.
    if (deviceInfo.measure_voltage < 0)
      deviceInfo.measure_voltage = Number(goecharger.nrg[3].toFixed(1));
    // console.log(`[GoeChargerApi] _getInfoAPIV1: numPhases_in: ${numPhases_in}, measure_voltage: ${deviceInfo.measure_voltage}`);

    // output voltage (V1 API nrg array)
    let numPhases_out = 0;
    let outputVoltage = 0;
    if ((goecharger.pha & 4) === 4) {
      deviceInfo["measure_voltage.output"] = Number(
        goecharger.nrg[2].toFixed(1)
      );
      numPhases_out++;
    }
    if ((goecharger.pha & 2) === 2) {
      deviceInfo["measure_voltage.output"] =
        deviceInfo["measure_voltage.output"] +
        Number(goecharger.nrg[1].toFixed(1));
      numPhases_out++;
    }
    if ((goecharger.pha & 1) === 1) {
      deviceInfo["measure_voltage.output"] =
        deviceInfo["measure_voltage.output"] +
        Number(goecharger.nrg[0].toFixed(1));
      numPhases_out++;
    }
    if (numPhases_out === 3) {
      deviceInfo["measure_voltage.output"] = Number(
        ((outputVoltage / numPhases_out) * Math.sqrt(3)).toFixed(1)
      );
    }
    // check for reversed phases.
    if (deviceInfo["measure_voltage.output"] < 0)
      deviceInfo["measure_voltage.output"] = Number(
        goecharger.nrg[3].toFixed(1)
      );
    // console.log(`[GoeChargerApi] _getInfoAPIV1: numPhases_out: ${numPhases}, measure_voltage_out: ${deviceInfo['measure_voltage.output']}`);

    // total energy consumed since reset (V1 API eto)
    if (goecharger.eto > 0)
      deviceInfo.meter_power = Number((goecharger.eto / 10).toFixed(1));

    // temperature (V1 API tmp) - 4th gen devices do not return tmp in V1 API.
    if (typeof goecharger.tmp !== "undefined" && goecharger.tmp !== null)
      deviceInfo.measure_temperature = Number(goecharger.tmp);

    // set cable limit (V1 API cbl)
    if (goecharger.cbl !== null)
      deviceInfo.cable_limit = Number(goecharger.cbl);

    // set current limit (V1 API amp)
    if (goecharger.amp !== null)
      deviceInfo.current_limit = Number(goecharger.amp);

    // device maximum current (V1 API ama)
    if (goecharger.ama !== null)
      deviceInfo.current_max = Number(goecharger.ama);

    return deviceInfo;
  }

  // ------------------------------------------------------------------------
  // API V2 functions called by above mapping functions

  async _getInfoAPIV2() {
    const deviceInfo = {
      id: "",
      name: "",
      status: "unknown",
      authentication: null,
      transaction: null,
      is_allowed: false,
      is_charging: false,
      is_connected: false,
      button_single_phase: false,
      button_three_phase: true,
      num_phases: "3",
      alarm_device: false,
      meter_power: null,
      "meter_power.session": null,
      measure_current: 0,
      measure_power: 0,
      measure_voltage: 0,
      "measure_voltage.output": 0,
      energy_total: null,
      measure_temperature: null,
      "measure_temperature.charge_port": null,
      cable_limit: null,
      current_limit: null,
      current_max: null,
      cards: null,
    };

    // API V2 status end point with filter for needed values
    const res = await this._getGoeCharger(
      "api/status?filter=sse,fna,car,alw,acs,frc,trx,cards,err,wh,pha,nrg,eto,tma,amp,ama,cbl,fsp"
    );
    const txt = await res.text();
    const goecharger = JSON.parse(txt);

    // Serial number for device ID (V2 API sse)
    deviceInfo.id = goecharger.sse;

    // Friendly name for device (V2 API fna)
    deviceInfo.name = goecharger.fna;

    // status (V2 API car)
    switch (goecharger.car) {
      case 1:
        deviceInfo.status = "station_idle";
        break;
      case 2:
        deviceInfo.status = "car_charging";
        break;
      case 3:
        deviceInfo.status = "station_waiting";
        break;
      case 4:
        deviceInfo.status = "car_finished";
        break;
      case 5:
        deviceInfo.status = "station_error";
        break;
      default:
        deviceInfo.status = "unknown";
    }

    // charging allowed (V2 API alw)
    deviceInfo.is_allowed = goecharger.alw;

    // wait authetication (V2 API acs)
    deviceInfo.authentication = Boolean(goecharger.acs);

    // transaction (V2 API trx) null if no transaction, 0 if anonymous, >0 if authenticated by card
    switch (goecharger.trx) {
      case 0:
        deviceInfo.transaction = "auth_0";
        break;
      case 1:
        deviceInfo.transaction = "auth_1";
        break;
      case 2:
        deviceInfo.transaction = "auth_2";
        break;
      case 3:
        deviceInfo.transaction = "auth_3";
        break;
      case 4:
        deviceInfo.transaction = "auth_4";
        break;
      case 5:
        deviceInfo.transaction = "auth_5";
        break;
      case 6:
        deviceInfo.transaction = "auth_6";
        break;
      case 7:
        deviceInfo.transaction = "auth_7";
        break;
      case 8:
        deviceInfo.transaction = "auth_8";
        break;
      case 9:
        deviceInfo.transaction = "auth_9";
        break;
      case 10:
        deviceInfo.transaction = "auth_10";
        break;
      default:
        deviceInfo.transaction = "auth_none";
    }

    // error (V2 API err)
    if (goecharger.err !== 0) deviceInfo.alarm_device = true;

    // allow (V2 API fsp)
    if (goecharger.fsp) {
      deviceInfo.button_single_phase = goecharger.fsp;
      deviceInfo.button_three_phase = !goecharger.fsp;
      deviceInfo.num_phases = "1";
    }

    // metered power (V2 API wh), convert to kWh
    deviceInfo["meter_power.session"] = Number(
      (goecharger.wh / 1000).toFixed(1)
    );

    // power (V2 API nrg array)
    // Filter out negative power values.
    if (goecharger.nrg[11] > 0) {
      deviceInfo.measure_power = Number(goecharger.nrg[11].toFixed(1));
    }

    // current amps (V2 API nrg array)
    // count number of active phases from current values if more than 0
    let numPhases = 0;
    if (goecharger.nrg[4] > 0) numPhases++;
    if (goecharger.nrg[5] > 0) numPhases++;
    if (goecharger.nrg[6] > 0) numPhases++;
    if (numPhases > 0)
      deviceInfo.measure_current = Number(
        (
          (goecharger.nrg[4] + goecharger.nrg[5] + goecharger.nrg[6]) /
          numPhases
        ).toFixed(1)
      );

    // voltage from connected source phases (V2 API nrg array)
    let numPhases_in = 0;
    if (goecharger.pha[3] === true) {
      deviceInfo.measure_voltage = Number(goecharger.nrg[0].toFixed(1));
      numPhases_in++;
    }
    if (goecharger.pha[4] === true) {
      deviceInfo.measure_voltage =
        deviceInfo.measure_voltage + Number(goecharger.nrg[1].toFixed(1));
      numPhases_in++;
    }
    if (goecharger.pha[5] === true) {
      deviceInfo.measure_voltage =
        deviceInfo.measure_voltage + Number(goecharger.nrg[2].toFixed(1));
      numPhases_in++;
    }
    if (numPhases_in === 3) {
      deviceInfo.measure_voltage = Number(
        ((deviceInfo.measure_voltage / numPhases_in) * Math.sqrt(3)).toFixed(1)
      );
    }
    // check for reversed phases.
    if (deviceInfo.measure_voltage < 0)
      deviceInfo.measure_voltage = Number(goecharger.nrg[3].toFixed(1));
    // console.log(`[GoeChargerApi] _getInfoAPIV2: numPhases_in: ${numPhases_in}, measure_voltage: ${deviceInfo.measure_voltage}`);

    // output voltage (V2 API pha and nrg arrays)
    let numPhases_out = 0;
    if (goecharger.pha[0] === true) {
      deviceInfo["measure_voltage.output"] = Number(
        goecharger.nrg[0].toFixed(1)
      );
      numPhases_out++;
    }
    if (goecharger.pha[1] === true) {
      deviceInfo["measure_voltage.output"] =
        deviceInfo["measure_voltage.output"] +
        Number(goecharger.nrg[1].toFixed(1));
      numPhases_out++;
    }
    if (goecharger.pha[2] === true) {
      deviceInfo["measure_voltage.output"] =
        deviceInfo["measure_voltage.output"] +
        Number(goecharger.nrg[2].toFixed(1));
      numPhases_out++;
    }
    if (numPhases_out === 3) {
      deviceInfo["measure_voltage.output"] = Number(
        (
          (deviceInfo["measure_voltage.output"] / numPhases_out) *
          Math.sqrt(3)
        ).toFixed(1)
      );
    }
    // check for reversed phases.
    if (deviceInfo["measure_voltage.output"] < 0)
      deviceInfo["measure_voltage.output"] = Number(
        goecharger.nrg[3].toFixed(1)
      );
    // console.log(`[GoeChargerApi] _getInfoAPIV2: numPhases_out: ${numPhases_out}, measure_voltage_out: ${deviceInfo['measure_voltage.output']}`);

    // total energy consumed since reset (V2 API eto)
    if (goecharger.eto > 0)
      deviceInfo.meter_power = Number((goecharger.eto / 1000).toFixed(1));

    // temperature (V2 API tma)
    if (typeof goecharger.tma !== "undefined" && goecharger.tma !== null) {
      if (goecharger.tma[0] !== null)
        deviceInfo["measure_temperature.charge_port"] = Number(
          goecharger.tma[0]
        );
      if (goecharger.tma[1] !== null)
        deviceInfo["measure_temperature"] = Number(goecharger.tma[1]);
    }

    // set cable limit (V2 API cbl)
    if (goecharger.cbl !== null)
      deviceInfo.cable_limit = Number(goecharger.cbl);

    // set current limit (V2 API amp)
    if (goecharger.amp !== null)
      deviceInfo.current_limit = Number(goecharger.amp);

    // device maximum current (V2 API ama)
    if (goecharger.ama !== null)
      deviceInfo.current_max = Number(goecharger.ama);

    // cards information (V2 API cards) - only return configured cards
    if (goecharger.cards && Array.isArray(goecharger.cards)) {
      deviceInfo.cards = goecharger.cards
        .filter((card) => card.cardId === true)
        .map((card, index) => ({
          id: index + 1,
          name: card.name,
          energy: card.energy,
          energyKwh: Number((card.energy / 1000).toFixed(3)),
        }));
    }

    return deviceInfo;
  }

  // ------------------------------------------------------------------------
  // Locally used common API GET fucntion for API V1 and V2

  async _getGoeCharger(uri) {
    // console.log(`[GoeChargerApi] _getGoeCharger: http://${this.address}/${uri}`);
    const response = await fetch(`http://${this.address}/${uri}`, {
      method: "GET",
    });
    if (!response.ok) {
      return Promise.reject(response);
    }
    // console.log(`[GoeChargerApi] _getGoeCharger result: ${response.status}`);
    return Promise.resolve(response);
  }

  // ------------------------------------------------------------------------
  // Locally used API SET fucntion for API V1

  async _setGoeChargerValueV1(key, value) {
    console.log(
      `[GoeChargerApi] _setGoeChargerValueV1: http://${this.address}/mqtt?payload=${key}=${value}`
    );
    const response = await fetch(
      `http://${this.address}/mqtt?payload=${key}=${value}`,
      { method: "GET" }
    );
    if (!response.ok) {
      return Promise.reject(response);
    }
    // console.log(`[GoeChargerApi] _setGoeChargerValueV1 result: ${response.status}`);
    return Promise.resolve(response);
  }

  // ------------------------------------------------------------------------
  // Locally used API SET fucntion for API V2

  async _setGoeChargerValueV2(key, value) {
    console.log(
      `[GoeChargerApi] _setGoeChargerValueV2: http://${this.address}/api/set?${key}=${value}`
    );
    const response = await fetch(
      `http://${this.address}/api/set?${key}=${value}`,
      { method: "GET" }
    );
    if (!response.ok) {
      return Promise.reject(response);
    }
    // console.log(`[GoeChargerApi] _setGoeChargerValueV2 result: ${response.status}`);
    return Promise.resolve(response);
  }
};
