'use strict';

const { Device } = require('homey');
const GoeChargerApi = require('../lib/go-echarger-api');
const { sleep, decrypt, encrypt } = require('../lib/helpers');


const POLL_INTERVAL = 5000;

class mainDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} start init.`);
    this.setUnavailable(`Initializing ${this.getName()}`);

    const settings = this.getSettings();
    this.api = new GoeChargerApi();
    this.api.address = settings.address;
    this.api.driver = this.driver.id;

    await this.checkCapabilities();
    await this.setCapabilityListeners();
    await this.setCapabilityValues(true);
    await sleep(5000);
    await this.setAvailable();
    await this.setCapabilityValuesInterval();

    this.setSettings({
      driver: this.api.driver,
    });

  } catch (error) {
    this.homey.app.log(`[Device] ${this.getName()} - OnInit Error`, error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} has been added.`);
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} settings where changed: ${changedKeys}`);
    this.api.address = newSettings.address;
    try {
      const initialInfo = await this.api.getInfo();
      this.log(`[Device] ${this.getName()}: ${this.getData().id} new settings OK.`);
      this.setAvailable();
      return Promise.resolve(initialInfo);
    } catch (e) {
      this.setUnavailable(e);
      return Promise.reject(e);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} was renamed.`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} has been deleted.`);
    this.clearIntervals();
  }

  onDiscoveryResult(discoveryResult) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} discovered - result: ${discoveryResult.id}.`);
    // Return a truthy value here if the discovery result matches your device.
    return discoveryResult.id === this.getData().id;
  }

  // This method will be executed once when the device has been found (onDiscoveryResult returned true)
  async onDiscoveryAvailable(discoveryResult) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} available - result: ${discoveryResult.address}.`);
    this.log(`[Device] ${this.getName()}: ${this.getData().id} type: ${discoveryResult.txt.devicetype}.`);
    this.api.address = discoveryResult.address;
    await this.setSettings({
      address: this.api.address,
    });
    await this.setAvailable();
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} changed - result: ${discoveryResult.address}.`);
    this.log(`[Device] ${this.getName()}: ${this.getData().id} changed - result: ${discoveryResult.name}.`);
    // Update your connection details here, reconnect when the device is offline
    this.api.address = discoveryResult.address;
    this.setSettings({
      address: this.api.address,
    });
    this.setAvailable();
  }

  onDiscoveryLastSeenChanged(discoveryResult) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} offline - result: ${discoveryResult.address}.`);
    this.log(`[Device] ${this.getName()}: ${this.getData().id} offline - result: ${discoveryResult.name}.`);
    this.api.address = discoveryResult.address;
    this.setSettings({
      address: this.api.address,
    });
    this.setUnavailable("Disovery device offline.");
  }

  async setCapabilityListeners() {
    this.registerCapabilityListener('onoff_charging_allowed', this.onCapability_ONOFF_CHARGING.bind(this));
    this.registerCapabilityListener('current_limit', this.onCapability_CURRENT_LIMIT.bind(this));
  }

  async onCapability_ONOFF_CHARGING(value) {
    let alw=0;
    if(value) { alw=1; }
    try {
      if (value !== this.getCapabilityValue('onoff_charging_allowed')) {
        this.log(`[Device] ${this.getName()}: ${this.getData().id} set OnOff Charging Allowed: '${value}'`);
        return Promise.resolve(await this.api.setGoeChargerValue('alw', alw));
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async onCapability_CURRENT_LIMIT(value) {
    try {
      if (value !== this.getCapabilityValue('current_limit')) {
        this.log(`[Device] ${this.getName()}: ${this.getData().id} setCurrentLimit: '${value}'`);
        return Promise.resolve(await this.api.setGoeChargerValue('amp', value));
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async setCapabilityValues(check = false) {
    try {
      const deviceInfo = await this.api.getInfo();
      const oldStatus = await this.getCapabilityValue('status');
      const currentLimitOpts = await this.getCapabilityOptions('current_limit');

      if (deviceInfo) {
        // console.log(JSON.stringify(deviceInfo));
        await this.setAvailable();

        await this.setValue('measure_power', deviceInfo.measure_power, check);
        await this.setValue('measure_current', deviceInfo.measure_current, check);
        await this.setValue('measure_voltage', deviceInfo.measure_voltage, check);
        await this.setValue('measure_temperature', deviceInfo.measure_temperature, check);
        await this.setValue('measure_temperature.charge_port', deviceInfo["measure_temperature.charge_port"], check);
        await this.setValue('meter_power', deviceInfo.meter_power, check);
        await this.setValue('onoff_charging_allowed', deviceInfo.onoff_charging_allowed, check);
        await this.setValue('current_limit', deviceInfo.current_limit, check);
        await this.setValue('current_max', deviceInfo.current_max, check);
        await this.setValue('is_connected', deviceInfo.is_connected, check);
        await this.setValue('alarm_device', deviceInfo.alarm_device, check);
        await this.setValue('energy_total', deviceInfo.energy_total, check);

        // Check for device's maximum current configuration and adjust device current_limit capability maximum setting value.
        // Only update if different.
        if(currentLimitOpts.max !== deviceInfo.current_max) {
          this.log(`[Device] ${this.getName()}: ${this.getData().id} setCurrentLimitOpts Max: '${deviceInfo.current_max}'`);
          await this.setCapabilityOptions('current_limit', { max: deviceInfo.current_max })
        }

        // Check for status change and trigger accordingly
        await this.setValue('status', deviceInfo.status, check);
        if (deviceInfo.status !== oldStatus) {
          if(deviceInfo.status === 'station_idle') {
            await this.setValue('is_charging', false);
          }
          if(deviceInfo.status === 'car_charging') {
            await this.setValue('is_charging', true);
          }
          if(deviceInfo.status === 'car_waiting') {
            await this.setValue('is_charging', false);
          }
          if(deviceInfo.status === 'car_finished') {
            await this.setValue('is_charging', false);
          }
        }
      }
    } catch (e) {
      this.setUnavailable(e);
      // console.log(e);
      return 'not connected';
    }
  }

  async setValue(key, value, firstRun = false, delay = 10) {
    if (this.hasCapability(key)) {
      const oldVal = await this.getCapabilityValue(key);

      // this.homey.app.log(`[Device] ${this.api.driver} ${this.getName()} - setValue - oldValue => ${key} => `, oldVal, value);

      if (delay) {
        await sleep(delay);
      }

      await this.setCapabilityValue(key, value);

      if (typeof value === 'boolean' && oldVal !== value && !firstRun) {
        const newKey = key.replace('.', '_');
        const triggers = this.homey.manifest.flow.triggers;
        const triggerExists = triggers.find((trigger) => trigger.id === `${newKey}_changed`);

      if (triggerExists) {
        await this.homey.flow
          .getDeviceTriggerCard(`${newKey}_changed`)
          .trigger(this)
          .catch(this.error)
          .then(this.homey.app.log(`[Device] ${this.getName()} - setValue ${newKey}_changed - Triggered: "${newKey} | ${value}"`));
        }
      }
    }
  }

  async setCapabilityValuesInterval() {
    try {
      this.log(`[Device] ${this.getName()}: ${this.getData().id} onPollInterval =>`, POLL_INTERVAL);
      this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), POLL_INTERVAL);
    } catch (error) {
      this.setUnavailable(error);
      this.log(error);
    }
  }

  async clearIntervals() {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} clearIntervals`);

    clearInterval(this.onPollInterval);
  }

  // ------------- Check if Capabilities has changed and update them -------------
  async checkCapabilities() {
    const driverManifest = this.driver.manifest;
    const driverCapabilities = driverManifest.capabilities;
    const deviceCapabilities = this.getCapabilities();

    this.homey.app.log(`[Device] ${this.getName()} - checkCapabilities for`, driverManifest.id);
    this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);

    await this.updateCapabilities(driverCapabilities, deviceCapabilities);

    return deviceCapabilities;
  }

  async updateCapabilities(driverCapabilities, deviceCapabilities) {
    try {
      const newC = driverCapabilities.filter((d) => !deviceCapabilities.includes(d));
      const oldC = deviceCapabilities.filter((d) => !driverCapabilities.includes(d));

      this.homey.app.log(`[Device] ${this.getName()} - Got old capabilities =>`, oldC);
      this.homey.app.log(`[Device] ${this.getName()} - Got new capabilities =>`, newC);

      oldC.forEach((c) => {
        this.homey.app.log(`[Device] ${this.getName()} - updateCapabilities => Remove `, c);
        this.removeCapability(c);
      });
      await sleep(2000);
      newC.forEach((c) => {
        this.homey.app.log(`[Device] ${this.getName()} - updateCapabilities => Add `, c);
        this.addCapability(c);
      });
      await sleep(2000);
    } catch (error) {
        this.homey.app.log(error);
    }
  }

}

module.exports = mainDevice;
