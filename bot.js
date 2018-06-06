const Discord = require("discord.js");
const client = new Discord.Client();
const config = require("./config.json");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./scores.sqlite');

client.on("ready", () => {
  // Check if the table "points" exists.
  const table = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name = 'scores';").get();
  if (!table['count(*)']) {
    // If the table isn't there, create it and setup the database correctly.
    sql.prepare("CREATE TABLE scores (id TEXT PRIMARY KEY, user TEXT, guild TEXT, points INTEGER, level INTEGER);").run();
    // Ensure that the "id" row is always unique and indexed.
    sql.prepare("CREATE UNIQUE INDEX idx_scores_id ON scores (id);").run();
    sql.pragma("synchronous = 1");
    sql.pragma("journal_mode = wal");
  }
  // And then we have two prepared statements to get and set the score data.
  client.getScore = sql.prepare("SELECT * FROM scores WHERE user = ? AND guild = ?");
  client.setScore = sql.prepare("INSERT OR REPLACE INTO scores (id, user, guild, points, level) VALUES (@id, @user, @guild, @points, @level);");

  // This event will run if the bot starts, and logs in, successfully.
  console.log('\x1b[42m%s\x1b[0m',`Bot has started, with ${client.users.size} users, in ${client.channels.size} channels of ${client.guilds.size} guilds.`);
  // Example of changing the bot's playing game to something useful. `client.user` is what the
  // docs refer to as the "ClientUser".
  client.user.setActivity(`Serving ${client.guilds.size} servers`);

});

client.on("guildCreate", guild => {
  // This event triggers when the bot joins a guild.
  console.log(`New guild joined: ${guild.name} (id: ${guild.id}). This guild has ${guild.memberCount} members!`);
  client.user.setActivity(`Serving ${client.guilds.size} servers`);
});

client.on("guildDelete", guild => {
  // this event triggers when the bot is removed from a guild.
  console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
  client.user.setActivity(`Serving ${client.guilds.size} servers`);
});

client.on("message", async message => {
  // Ignore bots, DMs and group messages.
  if (message.author.bot || !message.guild) return;

  /*
    START Points CODE
  */

  // Initialize ("declare") the points. If we did this in the condition it would not be
  // available later in commands. Because "scopes"!
  let score;

  if (message.guild) {
    // Try to get the current user's score.
    score = client.getScore.get(message.author.id, message.guild.id);

    // If the score doesn't exist (new user), initialize with defaults.
    if (!score) {
      score = { id: `${message.guild.id}-${message.author.id}`, user: message.author.id, guild: message.guild.id, points: 0, level: 1 };
    }

    // Increment points.
    score.points++;

    // Calculate the current level through MATH OMG HALP.
    const curLevel = Math.floor(0.1 * Math.sqrt(score.points));

    // Check if the user has leveled up, and let them know if they have:
    if(score.level < curLevel) {
      // Level up!
      message.reply(`You've leveled up to level **${curLevel}**! Ain't that dandy?`);
    }

    // Save data to the sqlite table.
    // This looks super simple because it's calling upon the prepared statement!
    client.setScore.run(score);
  }
    // Ignore any message that does not start with our prefix,
  if (message.content.indexOf(config.prefix) !== 0) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if(command === "points") {
    return message.reply(`You currently have ${score.points} points and are level ${score.level}!`);
  }

  if(command === "give") {
    // Limited to guild owner - adjust to your own preference!
    if(!message.author.id === message.guild.owner) return message.reply("You're not the boss of me, you can't do that!");

    // Try to get the user from mention. If not found, get the ID given and get a user from that ID.
    const user = message.mentions.users.first() || client.users.get(args[0]);
    if(!user) return message.reply("You must mention someone or give their ID!");

    // Read the amount of points to give to the user.
    const pointsToAdd = parseInt(args[1], 10);
    if(!pointsToAdd) return message.reply("You didn't tell me how many points to give...");

    // Get their current points. This can't use `score` because it's not the same user ;)
    let userscore = client.getScore.get(user.id, message.guild.id);

    // It's possible to give points to a user we haven't seen, so we need to initiate defaults here too!
    if (!userscore) {
      userscore = { id: `${message.guild.id}-${user.id}`, user: user.id, guild: message.guild.id, points: 0, level: 1 };
    }

    // Increment the score.
    userscore.points += pointsToAdd;

    // We also want to update their level (but we won't notify them if it changes)
    let userLevel = Math.floor(0.1 * Math.sqrt(score.points));
    userscore.level = userLevel;

    // And we save it!
    client.setScore.run(userscore);

    return message.channel.send(`${user.tag} has received ${pointsToAdd} points and now stands at ${userscore.points} points.`);
  }

  if(command === "leaderboard") {
    // Grab the
    const top10 = sql.prepare("SELECT * FROM scores WHERE guild = ? ORDER BY points DESC LIMIT 10;").all(message.guild.id);

    // Now shake it and show it! (as a nice embed, too!)
    const embed = new Discord.RichEmbed()
      .setTitle("Leaderboard")
      .setAuthor(client.user.username, client.user.avatarURL)
      .setDescription("Our top 10 points leaders!")
      .setColor(0x00AE86);

    for(const data of top10) {
      embed.addField(client.users.get(data.user).tag, `${data.points} points (level ${data.level})`);
    }
    return message.channel.send({embed});
  }
  if(command === "ping") {
    const m = await message.channel.send("Ping?");
    m.edit(`Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(client.ping)}ms`);
  }

  if(command === "say") {
    // makes the bot say something and delete the message. As an example, it's open to anyone to use.
    // To get the "message" itself we join the `args` back into a string with spaces:
    const sayMessage = args.join(" ");
    // Then we delete the command message (sneaky, right?). The catch just ignores the error with a cute smiley thing.
    message.delete().catch(O_o=>{});
    // And we get the bot to say the thing:
    message.channel.send(sayMessage);
  }

  if(command === "kick") {
    // This command must be limited to mods and admins. In this example we just hardcode the role names.
    // Please read on Array.some() to understand this bit:
    // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Array/some?
    if(!message.member.roles.some(r=>["Administrator", "Moderator"].includes(r.name)) )
      return message.reply("Sorry, you don't have permissions to use this!");

    // Let's first check if we have a member and if we can kick them!
    // message.mentions.members is a collection of people that have been mentioned, as GuildMembers.
    // We can also support getting the member by ID, which would be args[0]
    let member = message.mentions.members.first() || message.guild.members.get(args[0]);
    if(!member)
      return message.reply("Please mention a valid member of this server");
    if(!member.kickable)
      return message.reply("I cannot kick this user! Do they have a higher role? Do I have kick permissions?");

    // slice(1) removes the first part, which here should be the user mention or ID
    // join(' ') takes all the various parts to make it a single string.
    let reason = args.slice(1).join(' ');
    if(!reason) reason = "No reason provided";

    // Now, time for a swift kick in the nuts!
    await member.kick(reason)
      .catch(error => message.reply(`Sorry ${message.author} I couldn't kick because of : ${error}`));
    message.reply(`${member.user.tag} has been kicked by ${message.author.tag} because: ${reason}`);

  }

  if(command === "ban") {
    // Most of this command is identical to kick, except that here we'll only let admins do it.
    // In the real world mods could ban too, but this is just an example, right? ;)
    if(!message.member.roles.some(r=>["Administrator"].includes(r.name)) )
      return message.reply("Sorry, you don't have permissions to use this!");

    let member = message.mentions.members.first();
    if(!member)
      return message.reply("Please mention a valid member of this server");
    if(!member.bannable)
      return message.reply("I cannot ban this user! Do they have a higher role? Do I have ban permissions?");

    let reason = args.slice(1).join(' ');
    if(!reason) reason = "No reason provided";

    await member.ban(reason)
      .catch(error => message.reply(`Sorry ${message.author} I couldn't ban because of : ${error}`));
    message.reply(`${member.user.tag} has been banned by ${message.author.tag} because: ${reason}`);
  }

  if(command === "purge") {
    // This command removes all messages from all users in the channel, up to 100.

    // get the delete count, as an actual number.
    const deleteCount = parseInt(args[0], 10);

    // Ooooh nice, combined conditions. <3
    if(!deleteCount || deleteCount < 2 || deleteCount > 100)
      return message.reply("Please provide a number between 2 and 100 for the number of messages to delete");

    // So we get our messages, and delete them. Simple enough, right?
    const fetched = await message.channel.fetchMessages({limit: deleteCount});
    message.channel.bulkDelete(fetched)
      .catch(error => message.reply(`Couldn't delete messages because of: ${error}`));
  }
  if(command === "help") {
    const m = await message.channel.send("HELP");
    m.edit(`Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(client.ping)}ms`);

  }


});

client.login(config.token);
