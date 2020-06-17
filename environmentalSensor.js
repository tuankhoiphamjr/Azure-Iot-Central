"use strict";

// Use the Azure IoT device SDK for devices that connect to Azure IoT Central.
var iotHubTransport = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var Message = require('azure-iot-device').Message;
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

var provisioningHost = 'global.azure-devices-provisioning.net';
var idScope = '0ne0011E3B1';
var registrationId = 'ic1m0sutv8';
var symmetricKey = '+VksoFbspS9MPlNQQxAOLC3pAlGSyaHO2yfNikH5ikg=';
var provisioningSecurityClient = new SymmetricKeySecurityClient(registrationId, symmetricKey);
var provisioningClient = ProvisioningDeviceClient.create(provisioningHost, idScope, new ProvisioningTransport(), provisioningSecurityClient);
var hubClient;

var targetTemperature = 0;
var ledOn = true;

// Send simulated device telemetry.
function sendTelemetry() {
    var temp = targetTemperature + (Math.random() * 15);
    var humid = 70 + (Math.random() * 10);
    var data = JSON.stringify({
      temp: temp,
      humid: humid,
      });
    var message = new Message(data);
    hubClient.sendEvent(message, (err, res) => console.log(`Sent message: ${message.getData()}` +
      (err ? `; error: ${err.toString()}` : '') +
      (res ? `; status: ${res.constructor.name}` : '')));
  }

  // Send device twin reported properties.
function sendDeviceProperties(twin, properties) {
    twin.properties.reported.update(properties, (err) => console.log(`Sent device properties: ${JSON.stringify(properties)}; ` +
      (err ? `error: ${err.toString()}` : `status: success`)));
  }

  // Add any writeable properties your device supports,
// mapped to a function that's called when the writeable property
// is updated in the IoT Central application.
var writeableProperties = {
    'name': (newValue, callback) => {
        setTimeout(() => {
          callback(newValue, 'completed');
        }, 1000);
    },
    'brightness': (newValue, callback) => {
      setTimeout(() => {
          callback(newValue, 'completed');
      }, 5000);
    }
  };
  
  // Handle writeable property updates that come from IoT Central via the device twin.
  function handleWriteablePropertyUpdates(twin) {
    twin.on('properties.desired', function (desiredChange) {
      for (let setting in desiredChange) {
        if (writeableProperties[setting]) {
          console.log(`Received setting: ${setting}: ${desiredChange[setting].value}`);
          writeableProperties[setting](desiredChange[setting].value, (newValue, status) => {
            var patch = {
              [setting]: {
                value: newValue,
                status: status,
                desiredVersion: desiredChange.$version
              }
            }
            sendDeviceProperties(twin, patch);
          });
        }
      }
    });
  }

  // Setup command handlers
function setupCommandHandlers(twin) {

    // Handle synchronous LED blink command with request and response payload.
    function onBlink(request, response) {
      console.log('Received synchronous call to blink');
      var responsePayload = {
        status: 'Blinking LED every ' + request.payload  + ' seconds'
      }
      response.send(200, responsePayload, (err) => {
        if (err) {
          console.error('Unable to send method response: ' + err.toString());
        } else {
          console.log('Blinking LED every ' + request.payload  + ' seconds');
        }
      });
    }
  
    // Handle synchronous LED turn on command
    function turnOn(request, response) {
      console.log('Received synchronous call to turn on LED');
      if(!ledOn){
        console.log('Turning on the LED');
        ledOn = true;
      }
      response.send(200, (err) => {
        if (err) {
          console.error('Unable to send method response: ' + err.toString());
        }
      });
    }
  
    // Handle synchronous LED turn off command
    function turnOff(request, response) {
      console.log('Received synchronous call to turn off LED');
      if(ledOn){
        console.log('Turning off the LED');
        ledOn = false;
      }
      response.send(200, (err) => {
        if (err) {
          console.error('Unable to send method response: ' + err.toString());
        }
      });
    }
  
    // Handle asynchronous sensor diagnostics command with response payload.
    function diagnostics(request, response) {
      console.log('Starting asynchronous diagnostics run...');
      response.send(202, (err) => {
        if (err) {
          console.error('Unable to send method response: ' + err.toString());
        } else {
          var repetitions = 3;
          var intervalID = setInterval(() => {
            console.log('Generating diagnostics...');
            if (--repetitions === 0) {
              clearInterval(intervalID);
              var properties = {
                rundiagnostics: {
                  value: 'Diagnostics run complete at ' + new Date().toLocaleString()
                }
              };
              sendDeviceProperties(twin, properties);
            }
          }, 2000);
        }
      });
    }
  
    hubClient.onDeviceMethod('blink', onBlink);
    hubClient.onDeviceMethod('turnon', turnOn);
    hubClient.onDeviceMethod('turnoff', turnOff);
    hubClient.onDeviceMethod('rundiagnostics', diagnostics);
  }

  // Handle device connection to Azure IoT Central.
var connectCallback = (err) => {
    if (err) {
      console.log(`Device could not connect to Azure IoT Central: ${err.toString()}`);
    } else {
      console.log('Device successfully connected to Azure IoT Central');
  
      // Send telemetry to Azure IoT Central every 1 second.
      setInterval(sendTelemetry, 1000);
  
      // Get device twin from Azure IoT Central.
      hubClient.getTwin((err, twin) => {
        if (err) {
          console.log(`Error getting device twin: ${err.toString()}`);
        } else {
          // Send device properties once on device start up.
          var properties = {
            state: 'true'
          };
          sendDeviceProperties(twin, properties);
  
          handleWriteablePropertyUpdates(twin);
  
          setupCommandHandlers(twin);
        }
      });
    }
  };
  
  // Start the device (register and connect to Azure IoT Central).
  provisioningClient.register((err, result) => {
    if (err) {
      console.log('Error registering device: ' + err);
    } else {
      console.log('Registration succeeded');
      console.log('Assigned hub=' + result.assignedHub);
      console.log('DeviceId=' + result.deviceId);
      var connectionString = 'HostName=' + result.assignedHub + ';DeviceId=' + result.deviceId + ';SharedAccessKey=' + symmetricKey;
      hubClient = Client.fromConnectionString(connectionString, iotHubTransport);
  
      hubClient.open(connectCallback);
    }
  });