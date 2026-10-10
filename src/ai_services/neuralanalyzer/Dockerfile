FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# CPU-only PyTorch by default (AWS Fargate has no GPUs). For a CUDA build use e.g.
# --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu130
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

COPY requirements.txt ./
RUN pip install --no-cache-dir --index-url ${TORCH_INDEX_URL} $(grep -E '^(torch|torchvision)==' requirements.txt) \
    && pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "neural_app.py"]
