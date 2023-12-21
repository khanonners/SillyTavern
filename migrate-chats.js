// @ts-nocheck
/* eslint-disable */
const MONGO_URL = `mongodb://127.0.0.1:27017/`;

const { MongoClient } = require("mongodb");
const fs = require("fs");

async function main() {
    const client = new MongoClient(MONGO_URL, {});

    console.log("Connecting to database...");

    try {
        await client.connect();
        console.log("Connected to database");
        const database = client.db("agnai");
        const cChar = database.collection("character");
        const cChat = database.collection("chat");
        const cChatMessage = database.collection("chat-message");
        const cProfile = database.collection("profile");

        const personas = new Map();
        await cChar
            .find({ tags: "use: selfchar" })
            .toArray()
            .then((p) => {
                p.forEach((persona) => {
                    personas.set(persona._id, persona.name);
                });
            });

        const chats = await cChat.find({}).toArray();
        console.log("Found " + chats.length + " chats");

        /*
        Chat mongo doc:
        {
          "_id": "ad717d6d-b1c3-4a5d-ad53-5b6b8724c574",
          "kind": "chat",
          "mode": "standard",
          "characterId": "6840247b-18cf-47d7-b9b3-7ad989c412d6", // the target char
          "userId": "0d1f08bf-d947-45c7-9b69-fa3f165f8b3e", // user id but not persona
          "memberIds": [],
          "name": "",
          "greeting": "...",
          "scenarioIds": [],
          "createdAt": "2023-12-08T23:21:53.846Z",
          "updatedAt": "2023-12-09T00:32:59.770Z",
          "genPreset": "ef424475-1da9-42ed-8b0e-9532ed8b90d1",
          "messageCount": 1,
          "tempCharacters": {},
          "characters": {
            "1df8530a-8efa-457e-8cff-93daf6fc6545": false // usually the userpersona char
          },
          "genSettings": null
        }
        
        Target schema (jsonl):
        {"user_name":"%USER_PERSONA_NAME%","character_name":"%CHAR_NAME%","create_date":"2023-6-2 @21h 09m 51s 363ms","chat_metadata":{}}
        {"name":"%CHAR_NAME%","is_user":false,"is_name":true,"send_date":"2023-6-2 @21h 09m 51s 363ms","mes":"%MESSAGE_CONTENT%"}
        {"name":"%USER_PERSONA_NAME%","is_user":true,"is_name":true,"send_date":"2023-6-2 @22h 06m 28s 436ms","mes":"%MESSAGE_CONTENT%"}
        {"name":"%CHAR_NAME%","is_user":false,"is_name":false,"send_date":"2023-6-2 @22h 09m 46s 581ms","mes":"%MESSAGE_CONTENT%"}
        {"name":"%USER_PERSONA_NAME%","is_user":true,"is_name":true,"send_date":"2023-6-2 @23h 29m 53s 328ms","mes":"%MESSAGE_CONTENT%","extra":{"bias":""}}
        */

        for (let i = 0; i < chats.length; i++) {
            const chat = chats[i];
            const chatMessages = await cChatMessage
                .find({ chatId: chat._id })
                .toArray();
            const char = await cChar.findOne({ _id: chat.characterId });
            const charName = char.name;

            const userProfileName = await cProfile
                .findOne({ userId: chat.userId })
                .then((p) => p.handle);

            const chatEntityIdToName = {
                [chat.characterId]: charName,
                [chat.userId]: userProfileName,
            };

            const additionalChars = await cChar
                .find({ _id: { $in: Object.keys(chat.characters ?? {}) } })
                .toArray();
            additionalChars.forEach((c) => {
                chatEntityIdToName[c._id] = c.name;
            });

            const userOrPersonaId =
                [...additionalChars, { _id: chat.userId }].find((c) =>
                    personas.has(c._id)
                )?._id ?? chat.userId;
            console.log(
                `Processing chat ${i + 1}/${chats.length} (${
                    chatMessages.length
                } messages)`,
                {
                    charName,
                    others: Object.values(chatEntityIdToName),
                    probableUserName: chatEntityIdToName[userOrPersonaId],
                }
            );

            const lines = [
                {
                    user_name: chatEntityIdToName[userOrPersonaId],
                    character_name: charName,
                    create_date: humanizedISO8601DateTime(chat.createdAt),
                    chat_metadata: {},
                },
            ];
            for (let j = 0; j < chatMessages.length; j++) {
                const msg = chatMessages[j];
                const isUser = !!msg.userId || personas.has(msg.characterId);
                const name = chatEntityIdToName[msg.characterId ?? msg.userId];

                const line = {
                    name,
                    is_user: isUser,
                    is_name: false, // doesn't appear to be used
                    send_date: humanizedISO8601DateTime(msg.createdAt),
                    mes: msg.msg,
                    extra: { bias: null },
                };
                lines.push(line);
                // console.log(j, line);
            }

            const folderName = `./exported/${charName}`;
            const chatName = `Migrated ${humanizedISO8601DateTime(
                chat.createdAt
            )} ${charName}.jsonl`;

            if (!fs.existsSync(folderName)) {
                fs.mkdirSync(folderName, { recursive: true });
            }

            fs.writeFileSync(
                `${folderName}/${chatName}`,
                lines.map((l) => JSON.stringify(l)).join("\n")
            );
            console.log("Wrote to file", chatName);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

function humanizedISO8601DateTime(date) {
    let baseDate =
        typeof date === "number" ? new Date(date) : new Date(Date.parse(date));
    let humanYear = baseDate.getFullYear();
    let humanMonth = baseDate.getMonth() + 1;
    let humanDate = baseDate.getDate();
    let humanHour = (baseDate.getHours() < 10 ? "0" : "") + baseDate.getHours();
    let humanMinute =
        (baseDate.getMinutes() < 10 ? "0" : "") + baseDate.getMinutes();
    let humanSecond =
        (baseDate.getSeconds() < 10 ? "0" : "") + baseDate.getSeconds();
    let humanMillisecond =
        (baseDate.getMilliseconds() < 10 ? "0" : "") +
        baseDate.getMilliseconds();
    let HumanizedDateTime =
        humanYear +
        "-" +
        humanMonth +
        "-" +
        humanDate +
        " @" +
        humanHour +
        "h " +
        humanMinute +
        "m " +
        humanSecond +
        "s " +
        humanMillisecond +
        "ms";
    return HumanizedDateTime;
}

(async () => {
    await main();
})();
