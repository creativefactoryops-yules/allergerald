import os
import logging
import requests
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

BOT_TOKEN = os.environ.get("BOT_TOKEN")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not BOT_TOKEN or not ANTHROPIC_KEY:
    raise RuntimeError("Set BOT_TOKEN and ANTHROPIC_API_KEY env vars!")

SYSTEM = """You are Allergerald, an expert AI food allergy safety coordinator. Help diners identify safe menu items, draft allergy cards, and find allergy-aware restaurants. Help restaurant teams build allergy protocols, train staff, and create allergen menus. Be warm, calm, and reassuring. The 14 major allergens: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat/gluten, soybeans, sesame, mustard, celery, lupin, molluscs, sulphur dioxide."""

def ask_claude(user_msg):
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": "claude-sonnet-4-5", "max_tokens": 800, "system": SYSTEM, "messages": [{"role": "user", "content": user_msg}]},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]

async def start(update, ctx):
    name = update.effective_user.first_name or "there"
    chat_id = update.effective_chat.id
    
    if os.path.exists("~/allergerald/assets/gerald_animation.mp4"):
        with open("~/allergerald/assets/gerald_animation.mp4", "rb") as anim:
            await ctx.bot.send_animation(chat_id=chat_id, animation=anim, caption=f"Hey {name}! Allergerald here!")
    else:
        await ctx.bot.send_message(chat_id=chat_id, text=f"Hey {name}! Allergerald here!")
    
    await ctx.bot.send_message(
        chat_id=chat_id,
        text="Your food allergy safety companion.\n\nI can:\n• Check menus for allergens\n• Write your dining allergy card\n• Build restaurant protocols\n\nAre you here as a diner or restaurant team? Type /help to see everything I can do."
    )
    await ctx.bot.send_message(
        chat_id=chat_id,
        text="Heads up: I am an informational tool, not a substitute for checking directly with restaurant staff or consulting a doctor. In an emergency, seek medical help immediately."
    )

async def help_cmd(update, ctx):
    await update.message.reply_text("Allergerald Commands: /start - Welcome, /myallergies - Save profile, /menucheck - Check menu, /diningcard - Allergy card, /protocol - Restaurant protocol, /donate - Support, /help - This message. Or just type your allergy question!")

async def donate(update, ctx):
    await update.message.reply_text("Love Allergerald? Keep it running! Ko-fi: ko-fi.com/creativefactory. Even $3 helps. Thank you!")

async def myallergies(update, ctx):
    await update.message.reply_text("Let us set up your allergy profile. Reply with your allergens (e.g., peanuts, tree nuts, shellfish).")

async def menucheck(update, ctx):
    await update.message.reply_text("Paste a menu item and I will flag any allergens.")

async def diningcard(update, ctx):
    await update.message.reply_text("I will generate a dining allergy card for you. Tell me your allergens.")

async def protocol(update, ctx):
    await update.message.reply_text("Restaurant Protocol Builder. Tell me about your restaurant and I will build a custom safety protocol.")

async def handle_message(update, ctx):
    user_msg = update.message.text
    await update.message.reply_chat_action("typing")
    try:
        reply = ask_claude(user_msg)
        await update.message.reply_text(reply)
    except Exception as e:
        logging.error(f"Error: {e}")
        await update.message.reply_text("Allergerald hit a snag. Try again!")

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("donate", donate))
    app.add_handler(CommandHandler("myallergies", myallergies))
    app.add_handler(CommandHandler("menucheck", menucheck))
    app.add_handler(CommandHandler("diningcard", diningcard))
    app.add_handler(CommandHandler("protocol", protocol))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    print("Allergerald is online!")
    app.run_polling()

if __name__ == "__main__":
    main()
