import discord
from discord import app_commands
from discord.ext import commands
import aiohttp
import os
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
TOKEN = os.getenv("DISCORD_TOKEN")
BOT_OWNER_ID = int(os.getenv("BOT_OWNER_ID"))
API_BASE_URL = os.getenv("API_BASE_URL") # e.g. https://your-domain.pages.dev
BOT_SECRET = os.getenv("BOT_SECRET")

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)

# --- API Helper ---
async def call_partyrank_api(endpoint, payload):
    headers = {
        "Authorization": f"Bearer {BOT_SECRET}",
        "Content-Type": "application/json"
    }
    url = f"{API_BASE_URL}{endpoint}"
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            return await resp.json(), resp.status

# --- UI Components ---
class AssignView(discord.ui.View):
    def __init__(self, slug=None, thread_id=None):
        # Nếu có dữ liệu, ta tạo custom_id độc nhất chứa slug và thread_id
        # Định dạng: "PR_ASSIGN:[slug]:[thread_id]"
        super().__init__(timeout=None)
        if slug and thread_id:
            self.add_item(discord.ui.Button(
                label="Assign", 
                style=discord.ButtonStyle.green, 
                custom_id=f"PR_ASSIGN:{slug}:{thread_id}"
            ))

    # Pattern handle cho mọi nút có prefix PR_ASSIGN
    # Do discord.py handle persistent view theo custom_id, 
    # ta sẽ overwrite on_error hoặc dùng cách listener toàn cục nếu cần,
    # nhưng cách đơn giản nhất cho 1 view cụ thể là:
    @discord.ui.button(label="Assign", style=discord.ButtonStyle.green, custom_id="PR_ASSIGN_PLACEHOLDER")
    async def assign_callback(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Hàm này sẽ được gọi nếu custom_id khớp chính xác (cho các nút tạo mới)
        # Tuy nhiên với Persistent View động, ta nên xử lý ở setup_hook hoặc dùng Interaction check
        pass

# Cách tối ưu nhất để Dynamic data mà vẫn Persistent trong discord.py:
# Dùng bộ lọc trong on_interaction hoặc register view với custom_id cụ thể.
# Ở đây tôi sẽ dùng cách Register View lúc khởi tạo PR, và một Listener để bắt các nút cũ.

class PRBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        # Đăng ký View này để nó nhận diện được các custom_id bắt đầu bằng "PR_ASSIGN:"
        # Lưu ý: Với discord.py, mỗi tổ hợp slug/thread_id là một View instance nếu muốn dùng decorator.
        # Nhưng ta có thể bắt sự kiện toàn cục để xử lý cho gọn:
        pass

    async def on_interaction(self, interaction: discord.Interaction):
        if interaction.type == discord.InteractionType.component:
            custom_id = interaction.data.get("custom_id", "")
            if custom_id.startswith("PR_ASSIGN:"):
                await self.handle_assign_click(interaction, custom_id)

    async def handle_assign_click(self, interaction: discord.Interaction, custom_id: str):
        # Parse slug và thread_id từ custom_id "PR_ASSIGN:slug:thread_id"
        parts = custom_id.split(":")
        if len(parts) < 3: return
        slug, thread_id = parts[1], int(parts[2])

        await interaction.response.defer(ephemeral=True)

        # 1. Gọi API để invite
        payload = {
            "action": "add",
            "discord_id": str(interaction.user.id),
            "discord_username": interaction.user.display_name,
            "discord_avatar": str(interaction.user.display_avatar.url)
        }
        data, status = await call_partyrank_api(f"/api/party-rank/{slug}/master", payload)
        
        if status in (200, 201, 409):
            # 2. Add vào thread
            try:
                thread = interaction.guild.get_thread(thread_id) or await interaction.guild.fetch_channel(thread_id)
                await thread.add_user(interaction.user)
                await interaction.followup.send(f"✅ Đã thêm bạn vào Party Rank và thread {thread.mention}!", ephemeral=True)
            except Exception as e:
                await interaction.followup.send(f"⚠️ Đã invite vào web nhưng không thể add vào thread: {e}", ephemeral=True)
        else:
            await interaction.followup.send(f"❌ Lỗi API: {data.get('error', 'Unknown')}", ephemeral=True)

bot = PRBot()

class PRCreateModal(discord.ui.Modal, title="Create New Party Rank"):
    pr_name = discord.ui.TextInput(label="Tên Party Rank", placeholder="Ví dụ: Winter 2024 Anisong")
    pr_slug = discord.ui.TextInput(label="Slug (URL ID)", placeholder="ví dụ: winter-2024")
    pr_desc = discord.ui.TextInput(label="Mô tả", style=discord.TextStyle.long, required=False)

    async def on_submit(self, interaction: discord.Interaction):
        # 1. Gọi API tạo PR
        payload = {
            "slug": str(self.pr_slug),
            "name": str(self.pr_name),
            "description": str(self.pr_desc),
            "created_by_discord_id": str(interaction.user.id),
            "discord_guild_id": str(interaction.guild_id),
            "discord_channel_id": str(interaction.channel_id),
            # Chúng ta sẽ cập nhật thread_id sau khi tạo thread xong (hoặc sửa flow)
            # Trong ví dụ này, tôi sẽ tạo thread trước hoặc gửi metadata sau.
        }
        
        # Để tối ưu, ta có thể tạo thread ngay lúc này để lấy ID
        thread = await interaction.channel.create_thread(
            name=f"PR: {self.pr_name}",
            type=discord.ChannelType.public_thread
        )
        payload["discord_thread_id"] = str(thread.id)

        data, status = await call_partyrank_api("/api/party-rank/create", payload)

        if status != 200:
            # Nếu lỗi, có thể xóa thread vừa tạo để dọn dẹp (tùy chọn)
            # await thread.delete() 
            return await interaction.response.send_message(f"❌ Thất bại: {data.get('error')}", ephemeral=True)

        # 3. Gửi tin nhắn kèm nút Assign
        embed = discord.Embed(title=f"🎭 {self.pr_name}", description=str(self.pr_desc), color=discord.Color.blue())
        embed.add_field(name="Slug", value=str(self.pr_slug))
        embed.add_field(name="Thread", value=thread.mention)
        
        # Tạo View với thông tin ID để encode vào button
        view = AssignView(slug=str(self.pr_slug), thread_id=thread.id)
        await interaction.response.send_message(content="Một Party Rank mới đã được tạo!", embed=embed, view=view)

# --- Commands ---
@bot.tree.command(name="create_pr", description="Tạo một phiên Party Rank mới (Chỉ Admin)")
async def create_pr(interaction: discord.Interaction):
    if interaction.user.id != BOT_OWNER_ID:
        return await interaction.response.send_message("🚫 Bạn không có quyền dùng lệnh này!", ephemeral=True)
    
    await interaction.response.send_modal(PRCreateModal())

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"Bot logged in as {bot.user}")

if __name__ == "__main__":
    bot.run(TOKEN)
