FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache ca-certificates git

COPY go.mod ./
RUN go mod download

COPY . .

RUN go build -o server ./cmd/server

FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=builder /app/server /app/server
COPY --from=builder /app/openapi.json /app/openapi.json

ENV PORT=8080

EXPOSE 8080

CMD ["/app/server"]


