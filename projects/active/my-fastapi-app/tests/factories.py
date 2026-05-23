import factory
from factory.fuzzy import FuzzyText
import uuid

from app.models.user import User
from app.models.item import Item
from app.core.security import hash_password


class UserFactory(factory.Factory):
    class Meta:
        model = User

    id = factory.LazyFunction(uuid.uuid4)
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.Sequence(lambda n: f"user{n}")
    hashed_password = factory.LazyFunction(lambda: hash_password("testpass123"))
    is_active = True
    is_superuser = False


class ItemFactory(factory.Factory):
    class Meta:
        model = Item

    id = factory.LazyFunction(uuid.uuid4)
    title = factory.Sequence(lambda n: f"Item {n}")
    description = FuzzyText(length=50)
    owner_id = None
    is_public = False
