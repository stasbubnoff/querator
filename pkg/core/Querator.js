import { queratorConstructorSchema } from "../schemas/queratorConstructorSchema.js";
import { Logger } from "../utils/Logger.js";
import { parseSettings } from "../utils/parseSettings.js";
import { Validator } from "../utils/Validator.js";
class Querator {
  #CONFIG_TYPE = null;
  #BROKER_TYPE = null;
  #BROKER_URI = null;
  #BROKER_SETTINGS = null;
  #HANDLERS = /* @__PURE__ */ new Map();
  #PUBLISHER = null;
  #RECEIVER = null;
  #initBroker = async () => {
    try {
      switch (this.#BROKER_TYPE) {
        case "redis": {
          const { createClient } = await import("redis");
          this.#PUBLISHER = createClient(this.#BROKER_SETTINGS ?? {});
          this.#RECEIVER = createClient(this.#BROKER_SETTINGS ?? {});
          this.#PUBLISHER.on("error", (error) => {
            throw new Error(error);
          });
          this.#RECEIVER.on("error", (error) => {
            throw new Error(error);
          });
          await this.#PUBLISHER.connect();
          await this.#RECEIVER.connect();
          Logger.info("Redis broker connected");
          break;
        }
        case "rabbitmq": {
          const { default: amqplib } = await import("amqplib");
          const connection = await amqplib.connect(this.#BROKER_URI ?? this.#BROKER_SETTINGS ?? null, (err) => {
            if (err)
              throw new Error(err);
          });
          this.#PUBLISHER = await connection.createChannel();
          this.#RECEIVER = await connection.createChannel();
          Logger.info("RabbitMQ broker connected");
          break;
        }
        default:
          break;
      }
    } catch (error) {
      Logger.error("Failed to init broker", { error });
      process.exit(1);
    }
  };
  constructor(options) {
    try {
      if (!options)
        throw new Error("Querator config must be provided");
      const validateOptions = Validator.check(queratorConstructorSchema, options);
      if (!validateOptions) {
        throw new Error("Querator configuration failed");
      }
      this.#BROKER_TYPE = options.engine;
      if (options.file) {
        this.#BROKER_SETTINGS = parseSettings(options.file);
      } else {
        this.#BROKER_SETTINGS = options.settings || {};
      }
      console.log(this.#BROKER_SETTINGS);
    } catch (error) {
      Logger.error("Querator constructor error", { error });
      process.exit(1);
    }
  }
  async connect() {
    await this.#initBroker();
  }
  async unsubscribe(topic) {
    this.#RECEIVER.unsubscribe(topic);
  }
  async publish(topic, message) {
    try {
      switch (this.#BROKER_TYPE) {
        case "redis": {
          await this.#PUBLISHER.publish(topic, message);
          break;
        }
        case "rabbitmq": {
          await this.#PUBLISHER.sendToQueue(topic, Buffer.from(message));
          break;
        }
        default:
          break;
      }
    } catch (error) {
      Logger.error("Failed to publish message to queue");
    }
  }
  async receive(topic, handler) {
    try {
      switch (this.#BROKER_TYPE) {
        case "redis": {
          await this.#RECEIVER.subscribe(topic.toString(), (msg) => {
            handler(msg);
          });
          break;
        }
        case "rabbitmq": {
          await this.#RECEIVER.assertQueue(topic.toString());
          this.#RECEIVER.consume(topic.toString(), (msg) => {
            handler(msg.content.toString());
            this.#RECEIVER.ack(msg);
          });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      Logger.error("Failed to subscribe to topic");
    }
  }
  async ping() {
  }
}
export {
  Querator
};
