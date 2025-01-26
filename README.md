# go-e Charger

Smart EV Charging from go-e

Adds support for the go-e Home and Gemini family of EV chargers for the Athom Homey Pro.

## Setup

- 1st and 2nd generation devices must have fixed IP address.
- 3rd and 4th generation devices are automatically detected with mDNS-DS in the same LAN.
- API V1 must be enabled on the 1st and 2nd generation devices.
- API V2 must be enabled on the 3rd and 4th generation devices with firware 55.6 or above installed.

## Supported devices

### go-e Charger Home series

- 1st generation devices with serial numbers starting with CC1- (API V1)
- 2nd generation devices with serial numbers starting with CM-02- (API V1)
- 3rd generation devices with serial numbers starting with CM-03- (API V2)

### go-e Charger Gemini series

- 4th generation devices with serial numbers starting with GM-10- (API V2)

## Supported flow cards

### When

- Status changed
- Car connection changed
- Charging allowed changed
- Charging changed
- Delivered Energy This Session becomes greater/less than `number`kWh
- Supplied Power becomes greater/less than `number`W
- Supplied Current becomes greater/less than `number`A
- Supplied Voltage becomes greater/less than `number`V
- Temperature becomes greater/less than `number`C
- Charge Port Temperature becomes greater/less than `number`C

### And

- Car is/isn't connected
- Charging is/isn't allowed
- Is/Isn't charging

### Then

- Allow charging
- Stop charging
- Change current limit to `amperage`A

## Example flows

![Example flows](/assets/images/flow-examples.png)
