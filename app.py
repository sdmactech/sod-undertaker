from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

import os

app = Flask(__name__)

# Use DATABASE_URL env var if set (for production), else local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///undertaker.db')
# Railway gives postgres:// — normalize and switch to pg8000 dialect (no libpq needed)
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql+pg8000://', 1)
elif DATABASE_URL.startswith('postgresql://'):
    DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+pg8000://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'sod-undertaker-slimm-brinkman-2024')

db = SQLAlchemy(app)

# ─── Models ───────────────────────────────────────────────────────────────────

class Item(db.Model):
    __tablename__ = 'items'
    id             = db.Column(db.Integer, primary_key=True)
    name           = db.Column(db.String(120), nullable=False)
    category       = db.Column(db.String(80), default='General')
    adds_to_payout = db.Column(db.Float, nullable=True)
    cost_to_make   = db.Column(db.String(80), nullable=True)
    cost_numeric   = db.Column(db.Float, nullable=True)   # parsed numeric cost for best-value calc
    can_craft      = db.Column(db.Boolean, default=False)
    obtain_note    = db.Column(db.String(255), nullable=True)
    notes          = db.Column(db.Text, nullable=True)
    icon           = db.Column(db.String(10), nullable=True)
    in_stock       = db.Column(db.Integer, default=0)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    ingredients    = db.relationship('Ingredient', backref='item', lazy=True, cascade='all, delete-orphan')

    def profit_pct(self):
        if self.adds_to_payout and self.cost_numeric and self.cost_numeric > 0:
            return round(((self.adds_to_payout - self.cost_numeric) / self.cost_numeric) * 100, 1)
        return None

    def to_dict(self):
        return {
            'id':             self.id,
            'name':           self.name,
            'category':       self.category,
            'adds_to_payout': self.adds_to_payout,
            'cost_to_make':   self.cost_to_make,
            'cost_numeric':   self.cost_numeric,
            'profit_pct':     self.profit_pct(),
            'can_craft':      self.can_craft,
            'obtain_note':    self.obtain_note,
            'notes':          self.notes,
            'icon':           self.icon,
            'in_stock':       self.in_stock,
            'ingredients':    [i.to_dict() for i in self.ingredients],
            'updated_at':     self.updated_at.strftime('%Y-%m-%d %H:%M') if self.updated_at else '',
        }


class Ingredient(db.Model):
    __tablename__ = 'ingredients'
    id         = db.Column(db.Integer, primary_key=True)
    item_id    = db.Column(db.Integer, db.ForeignKey('items.id'), nullable=False)
    name       = db.Column(db.String(120), nullable=False)
    quantity   = db.Column(db.String(40), default='1')
    obtainable = db.Column(db.String(10), default='Yes')

    def to_dict(self):
        return {
            'id':         self.id,
            'item_id':    self.item_id,
            'name':       self.name,
            'quantity':   self.quantity,
            'obtainable': self.obtainable,
        }


class IngredientStock(db.Model):
    """Tracks raw ingredient quantities in storage."""
    __tablename__ = 'ingredient_stock'
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(120), nullable=False, unique=True)
    quantity   = db.Column(db.Integer, default=0)
    notes      = db.Column(db.String(255), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':         self.id,
            'name':       self.name,
            'quantity':   self.quantity,
            'notes':      self.notes,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M') if self.updated_at else '',
        }


# ─── Seed Data ────────────────────────────────────────────────────────────────

SEED_ITEMS = [
    {
        'name': 'Burial Perfume Oil', 'category': 'Burial Preparation',
        'adds_to_payout': 100.0, 'cost_to_make': '$18–20', 'cost_numeric': 19.0,
        'can_craft': True, 'obtain_note': 'Craftable – Prairie Poppy & Oil',
        'notes': None, 'icon': '🧴',
        'ingredients': [
            {'name': 'Prairie Poppy', 'quantity': 'x5', 'obtainable': 'Yes'},
            {'name': 'Oil',           'quantity': 'x1', 'obtainable': 'Yes'},
        ]
    },
    {
        'name': 'Burial Wraps', 'category': 'Burial Preparation',
        'adds_to_payout': 100.0, 'cost_to_make': '$18–20', 'cost_numeric': 19.0,
        'can_craft': True, 'obtain_note': 'Bandages from Doctor; Beeswax craftable',
        'notes': 'Bandages from Dr are expensive – check pricing', 'icon': '🩹',
        'ingredients': [
            {'name': 'Bandages', 'quantity': 'x10', 'obtainable': 'No'},
            {'name': 'Beeswax',  'quantity': 'x1',  'obtainable': 'Yes'},
        ]
    },
    {
        'name': 'Good-Bye Liquor', 'category': 'Ceremony Items',
        'adds_to_payout': 100.0, 'cost_to_make': None, 'cost_numeric': None,
        'can_craft': False, 'obtain_note': 'MUST buy from Saloon Owner',
        'notes': None, 'icon': '🥃',
        'ingredients': [
            {'name': 'Whiskey', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
    {
        'name': 'Flower Arrangement', 'category': 'Decoration',
        'adds_to_payout': 150.0, 'cost_to_make': '$9', 'cost_numeric': 9.0,
        'can_craft': True, 'obtain_note': 'All ingredients growable / gatherable',
        'notes': None, 'icon': '💐',
        'ingredients': [
            {'name': 'Prairie Poppy',  'quantity': 'x1', 'obtainable': 'Yes'},
            {'name': 'Hemp',           'quantity': 'x1', 'obtainable': 'Yes'},
            {'name': 'Oleander Sage',  'quantity': 'x1', 'obtainable': 'Yes'},
        ]
    },
    {
        'name': 'Hunters Gold Eye Cover', 'category': 'Burial Preparation',
        'adds_to_payout': 100.0, 'cost_to_make': None, 'cost_numeric': None,
        'can_craft': False, 'obtain_note': 'MUST contract Blacksmith – 1 Gold Bar yields 10 coins',
        'notes': None, 'icon': '🪙',
        'ingredients': [
            {'name': 'Gold Bar', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
    {
        'name': 'Honey', 'category': 'Preservation',
        'adds_to_payout': 50.0, 'cost_to_make': '$5+', 'cost_numeric': 5.0,
        'can_craft': True, 'obtain_note': 'Gatherable',
        'notes': None, 'icon': '🍯',
        'ingredients': [
            {'name': 'Honey', 'quantity': 'x1', 'obtainable': 'Yes'},
        ]
    },
    {
        'name': 'Acid', 'category': 'Preservation',
        'adds_to_payout': 50.0, 'cost_to_make': '$25–30+', 'cost_numeric': 27.5,
        'can_craft': True, 'obtain_note': 'Vinegar Shrub from Saloon Owner; others obtainable',
        'notes': 'Needs price adjusted to $100–$150 based on complexity and difficulty obtaining. Yields 5 Acid per craft.', 'icon': '⚗️',
        'ingredients': [
            {'name': 'Nitrate',       'quantity': 'x3', 'obtainable': 'Yes'},
            {'name': 'Vinegar Shrub', 'quantity': 'x2', 'obtainable': 'No'},
            {'name': 'Salt',          'quantity': 'x2', 'obtainable': 'Yes'},
            {'name': 'Coal',          'quantity': 'x1', 'obtainable': 'Yes'},
        ]
    },
    {
        'name': 'Cigar', 'category': 'Ceremony Items',
        'adds_to_payout': 50.0, 'cost_to_make': '$10–15 (purchase)', 'cost_numeric': 12.5,
        'can_craft': False, 'obtain_note': 'MUST buy from Tobacconist',
        'notes': None, 'icon': '🚬',
        'ingredients': [
            {'name': 'Cigar', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
    {
        'name': 'Wine', 'category': 'Ceremony Items',
        'adds_to_payout': 50.0, 'cost_to_make': '$10–15 (purchase)', 'cost_numeric': 12.5,
        'can_craft': False, 'obtain_note': 'MUST buy from Saloon Owner',
        'notes': 'Consider raising payout to $75–$100 like Good-Bye Liquor', 'icon': '🍷',
        'ingredients': [
            {'name': 'Wine', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
    {
        'name': 'Gold Bar', 'category': 'Premium Items',
        'adds_to_payout': 250.0, 'cost_to_make': None, 'cost_numeric': None,
        'can_craft': False, 'obtain_note': 'MUST buy / contract Blacksmith',
        'notes': None, 'icon': '🏅',
        'ingredients': [
            {'name': 'Gold Bar', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
    {
        'name': 'Diamond', 'category': 'Premium Items',
        'adds_to_payout': 250.0, 'cost_to_make': None, 'cost_numeric': None,
        'can_craft': False, 'obtain_note': 'Very difficult to obtain',
        'notes': 'Should be worth $400–$500 based on difficulty obtaining', 'icon': '💎',
        'ingredients': [
            {'name': 'Diamond', 'quantity': 'x1', 'obtainable': 'No'},
        ]
    },
]

SEED_ING_STOCK = [
    'Prairie Poppy', 'Oil', 'Bandages', 'Beeswax', 'Whiskey',
    'Hemp', 'Oleander Sage', 'Gold Bar', 'Honey',
    'Nitrate', 'Vinegar Shrub', 'Salt', 'Coal',
    'Cigar', 'Wine', 'Diamond',
]

def seed_database():
    if Item.query.count() == 0:
        for data in SEED_ITEMS:
            ings = data.pop('ingredients', [])
            item = Item(**data)
            db.session.add(item)
            db.session.flush()
            for ing in ings:
                db.session.add(Ingredient(item_id=item.id, **ing))
        db.session.commit()
        print("✅ Items seeded.")

    if IngredientStock.query.count() == 0:
        for name in SEED_ING_STOCK:
            db.session.add(IngredientStock(name=name, quantity=0))
        db.session.commit()
        print("✅ Ingredient stock seeded.")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Items API ──────────────────────────────────────────────────────────────────

@app.route('/api/items', methods=['GET'])
def get_items():
    sort = request.args.get('sort', 'category')   # category | payout | profit
    q = Item.query
    if sort == 'payout':
        items = q.order_by(Item.adds_to_payout.desc().nullslast()).all()
    elif sort == 'profit':
        # sort by profit_pct descending (computed in Python since it's derived)
        items = sorted(q.all(), key=lambda i: (i.profit_pct() or -9999), reverse=True)
    else:
        items = q.order_by(Item.category, Item.name).all()
    return jsonify([i.to_dict() for i in items])


@app.route('/api/items/<int:item_id>', methods=['GET'])
def get_item(item_id):
    return jsonify(Item.query.get_or_404(item_id).to_dict())


@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.get_json()
    ings = data.pop('ingredients', None)
    for key, val in data.items():
        if hasattr(item, key):
            setattr(item, key, val)
    item.updated_at = datetime.utcnow()
    if ings is not None:
        Ingredient.query.filter_by(item_id=item_id).delete()
        for ing in ings:
            db.session.add(Ingredient(item_id=item_id, **ing))
    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/api/items/<int:item_id>/stock', methods=['PATCH'])
def update_item_stock(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.get_json()
    new_qty = max(0, data.get('in_stock', item.in_stock))
    item.in_stock   = new_qty
    item.updated_at = datetime.utcnow()
    # Sync ingredient stock if same name exists there
    ing_row = IngredientStock.query.filter_by(name=item.name).first()
    if ing_row:
        ing_row.quantity   = new_qty
        ing_row.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(item.to_dict())


@app.route('/api/categories', methods=['GET'])
def get_categories():
    cats = db.session.query(Item.category).distinct().order_by(Item.category).all()
    return jsonify([c[0] for c in cats])


@app.route('/api/items/craftable_counts', methods=['GET'])
def craftable_counts():
    """Return how many of each craftable item could be made right now from ingredient stock."""
    import re
    ing_stock = {r.name: r.quantity for r in IngredientStock.query.all()}
    result = {}
    for item in Item.query.all():
        if not item.can_craft or not item.ingredients:
            result[item.id] = None   # not craftable
            continue
        min_craftable = None
        for ing in item.ingredients:
            # Parse quantity string like "x5", "x 2", "5", "1" → int
            raw = str(ing.quantity or '1').lower().replace('x', '').strip()
            try:
                required = int(re.sub(r'[^0-9]', '', raw) or '1')
            except Exception:
                required = 1
            if required < 1:
                required = 1
            available = ing_stock.get(ing.name, 0)
            can_make = available // required
            if min_craftable is None or can_make < min_craftable:
                min_craftable = can_make
        result[item.id] = min_craftable if min_craftable is not None else 0
    return jsonify(result)


# ── Ingredient Stock API ──────────────────────────────────────────────────────

@app.route('/api/ingredient_stock', methods=['GET'])
def get_ingredient_stock():
    rows = IngredientStock.query.order_by(IngredientStock.name).all()
    return jsonify([r.to_dict() for r in rows])


@app.route('/api/ingredient_stock', methods=['POST'])
def create_ingredient_stock():
    data = request.get_json()
    # upsert by name
    existing = IngredientStock.query.filter_by(name=data['name']).first()
    if existing:
        existing.quantity   = data.get('quantity', existing.quantity)
        existing.notes      = data.get('notes', existing.notes)
        existing.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(existing.to_dict())
    row = IngredientStock(name=data['name'], quantity=data.get('quantity', 0), notes=data.get('notes'))
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@app.route('/api/ingredient_stock/<int:row_id>', methods=['PATCH'])
def update_ingredient_stock(row_id):
    row = IngredientStock.query.get_or_404(row_id)
    data = request.get_json()
    if 'quantity' in data:
        new_qty = max(0, data['quantity'])
        row.quantity = new_qty
        # Sync burial item stock if same name exists there
        item = Item.query.filter_by(name=row.name).first()
        if item:
            item.in_stock   = new_qty
            item.updated_at = datetime.utcnow()
    if 'notes' in data:
        row.notes = data['notes']
    row.updated_at = datetime.utcnow()
    db.session.commit()
    # Return both updated objects so frontend can sync
    result = row.to_dict()
    item = Item.query.filter_by(name=row.name).first()
    result['synced_item_id']    = item.id    if item else None
    result['synced_item_stock'] = item.in_stock if item else None
    return jsonify(result)


@app.route('/api/ingredient_stock/<int:row_id>', methods=['DELETE'])
def delete_ingredient_stock(row_id):
    row = IngredientStock.query.get_or_404(row_id)
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True})


# ── Stats API ─────────────────────────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    total_items  = Item.query.count()
    craftable    = Item.query.filter_by(can_craft=True).count()
    max_payout   = db.session.query(db.func.max(Item.adds_to_payout)).scalar() or 0
    categories   = db.session.query(Item.category).distinct().count()
    total_stock  = db.session.query(db.func.sum(Item.in_stock)).scalar() or 0
    ing_stock    = db.session.query(db.func.sum(IngredientStock.quantity)).scalar() or 0
    # best value item
    items = Item.query.all()
    best = max(items, key=lambda i: i.profit_pct() or -9999) if items else None
    return jsonify({
        'total_items':   total_items,
        'craftable':     craftable,
        'max_payout':    max_payout,
        'categories':    categories,
        'total_stock':   total_stock,
        'ing_stock':     ing_stock,
        'best_value':    best.name if best and best.profit_pct() else '—',
        'best_value_pct': best.profit_pct() if best else None,
    })


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_database()
    port = int(os.environ.get('PORT', 5050))
    app.run(host='0.0.0.0', port=port, debug=False)